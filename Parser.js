/*
 * Copyright (c) 2012 Adobe Systems Incorporated. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

/*jslint vars: true, plusplus: true, devel: true, browser: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, brackets, $, esprima */

define(function (require, exports, module) {
	'use strict';

	var NativeFileSystem = brackets.getModule("file/NativeFileSystem").NativeFileSystem,
		FileUtils        = brackets.getModule("file/FileUtils");

	var Debugger = require("Debugger");

	var $script;
	var $exports = $(exports);
	var documentIndexes = {};
	var tracepointsForUrl = {};

	/** Event Handlers *******************************************************/

	/** Actions **************************************************************/

	function parseString(code, options) {
		return esprima.parse(code, options);
	}

	function parseDocument(doc, options) {
		if (! doc || doc.extension !== 'js') { return; }
		return parseString(doc.getText(), options);
	}

	function locationIsBetween(location, start, end) {
		// Does not start before location
		if (! (start.line < location.line || (start.line === location.line && start.column < location.column))) { return false; }
		// Starts before, but does not end after location
		if (!   (end.line > location.line ||   (end.line === location.line &&   end.column > location.column))) { return false; }
		// Location is between start and end
		return true;
	}

	function Index(tree) {
		this.tree = tree;
		this.functions = [];
		this.variables = {};
	}

	Index.prototype = {
		addFunction: function (func) {
			this.functions.push(func);
		},

		addVariable: function (node) {
			var line   = node.loc.start.line - 1;
			var column = node.loc.start.column;
			
			if (! this.variables[line]) { this.variables[line] = {}; }
			this.variables[line][column] = node.name;
		},

		findFunctionAtLocation: function (location) {
			for (var func, i = 0, length = this.functions.length; i < length; i++) {
				if ((func = this.functions[i].findFunctionAtLocation(location))) { return func; }
			}
		},
		
		findVariableAtLocation: function (location) {
			return this.variables[location.line] ? this.variables[location.line][location.column] : null;
		}
	};

	function FunctionNode(node) {
		this.node       = node;
		this.name       = node.id ? node.id.name : null;
		
		this.start      = node.loc.start;
		this.end        = node.loc.end;
		this.start.line -= 1;
		this.end.line   -= 1;
		
		this.children   = [];
	}

	FunctionNode.prototype = {
		addChild: function (func) {
			func.parent = this;
			this.children.push(func);
		},
		
		findFunctionAtLocation: function (location) {
			if (! locationIsBetween(location, this.start, this.end)) { return; }
			for (var func, i = 0, length = this.children.length; i < length; i++) {
				if ((func = this.children[i].findFunctionAtLocation(location))) { return func; }
			}
			return this;
		},

		setTracepoints: function (url) {
			var tracepoints = [];

			// Now add two tracepoints, one at the beginning, one at the end of the function
			var key, keys = ["start", "end"];
			while ((key = keys.shift())) {
				var loc = this[key];
				var location = {
					url: url,
					lineNumber: loc.line,
					// The end tracepoint needs be before }, not after, else it's hit right with the first one
					columnNumber: key === 'end' ? loc.column - 1 : loc.column
				};
				var tracepoint = Debugger.setTracepoint(location, "function." + key);
				tracepoints.push(tracepoint);
			}
			
			// Remember the tracepoints
			this.tracepoints = tracepoints;
			
			if (! tracepointsForUrl[url]) {
				tracepointsForUrl[url] = [];
			}
			tracepointsForUrl[url] = tracepointsForUrl[url].concat(tracepoints);
		}
	};

	function indexDocument(doc) {
		if (! doc) { return; }
		if (documentIndexes[doc.url]) { return documentIndexes[doc.url]; }

		// Loc: store locations as node.loc.(start|end).(line|column)
		var tree = parseDocument(doc, { loc: true });

		if (! tree) { return; }

		removeFunctionTracepoints(doc.url);
		
		var index = documentIndexes[doc.url] = new Index(tree);
	
		var onFunction = function (node) {
			var func = new FunctionNode(node);
			var parent = index.findFunctionAtLocation({ line: func.start.line, column: func.start.column });
			if (parent) {
				parent.addChild(func);
			} else {
				index.addFunction(func);
			}
			func.setTracepoints(doc.url);
		};

		index.variables = {};
		var onVariable = function (node) {
			if (node.type === 'ThisExpression') { node.name = "this"; }
			else if (node.type === 'VariableDeclarator') { node = node.id; }
			index.addVariable(node);
		};

		var handlers = {
			FunctionDeclaration: onFunction,
			FunctionExpression:  onFunction,
			Identifier:          onVariable,
			VariableDeclarator:  onVariable,
			ThisExpression:      onVariable
		};
		
		walkParseTree(tree, handlers);

		return index;
	}

	function walkParseTree(tree, handlers) {
		var ignore = {
			id:       true,
			type:     true,
			kind:     true,
			property: true,
			loc:      true,
			range:    true
		};
		
		var queue = [tree];
		var current, type, abstractType, key, value, i;

		while (queue.length) {
			current = queue.shift();
			type    = current.type;
			
			if (type && handlers[type]) {
				handlers[type](current);
			}

			for (key in current) {
				if (ignore[key] || ! current.hasOwnProperty(key)) { continue; }
				value = current[key];
				if ($.isArray(value)) {
					queue = queue.concat(value);
				}
				else if (typeof value === 'object' && value !== null) {
					queue.push(value);
				}
			}
		}
	}

	function removeFunctionTracepoints(url) {
		// Remove the old tracepoints
		if (tracepointsForUrl[url]) {
			$.each(tracepointsForUrl[url], function (index, tracepoint) {
				tracepoint.remove();
			});
			delete tracepointsForUrl[url];
		}
	}

	/** Private Functions *******************************************************/

	/** Helper Functions *******************************************************/

	function loadEsprima() {
		if (typeof esprima !== 'undefined') { return; }
		$script = $("<script>").attr("src", require.toUrl("lib/esprima.js")).appendTo(window.document.head);
	}

	/** Init Functions *******************************************************/
	
	// init
	function init() {
		loadEsprima();
	}

	function unload() {
		if ($script) {
			$script.remove();
		}
	}

	// public methods
	exports.init = init;
	exports.unload = unload;

	exports.parseString = parseString;
	exports.parseDocument = parseDocument;
	exports.indexDocument = indexDocument;
	exports.walkParseTree = walkParseTree;
});
