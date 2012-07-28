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

	var DocumentManager  = brackets.getModule("document/DocumentManager");

	var Debugger = require("Debugger");

	var $script;
	var $exports = $(exports);
	var documentIndexes = {};

	/** Classes **************************************************************/

	function Index(doc, handlers) {
		this.doc = doc;

		this.functions = [];
		this.variables = {};
		
		// Loc: store locations as node.loc.(start|end).(line|column)
		try {
			var tree = parseDocument(doc, { loc: true });
			if (tree) { walkParseTree(tree, handlers, this); }
		}
		catch (e) {
			console.log("Could not parse", doc.url, e);
		}
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
		},

		setTracepoints: function () {
			var results = [];
			var queue = [].concat(this.functions);
			var func;
			while ((func = queue.shift())) {
				queue = queue.concat(func.children);
				results.push(func.setTracepoints(this.doc.url));
			}
			return $.when.apply(null, results);
		}
	};

	function FunctionNode(node) {
		this.node  = node;

		this.name  = node.id ? node.id.name : null;
		this.start = node.loc.start;
		this.end   = node.loc.end;
		
		this.start.line -= 1;
		this.end.line   -= 1;
		
		this.children    = [];
		this.tracepoints = {};
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

		// Add two tracepoints, one at the beginning, one at the end of the function
		setTracepoints: function (url) {
			var result = new $.Deferred();
			
			var key, keys = ["start", "end"];
			var remaining = keys.length;
			function onTracepointSet() { if (! --remaining) { result.resolve(); } }
			
			while ((key = keys.shift())) {
				var location = { url: url, lineNumber: this[key].line, columnNumber: this[key].column };
				// The end tracepoint needs be before }, not after, else it's hit right with the first one
				if (key === 'end') { location.columnNumber--; }
				var tracepoint = this.tracepoints[key] = Debugger.setTracepoint(location, "function." + key);
				$(tracepoint).one("set", onTracepointSet);
			}

			return result;
		},

		resolveVariableBefore: function (variable, constraints) {
			return this.tracepoints.start.resolveVariable(variable, constraints);
		},

		resolveVariableAfter: function (variable, constraints) {
			return this.tracepoints.end.resolveVariable(variable, constraints);
		}
	};

	/** Event Handlers *******************************************************/

	function onScriptRequested(event, url) {
		if (url.slice(0, 7) !== "file://") { return; }
		if (url.indexOf("/lib/") !== -1) { return; }
		if (url.slice(-7) === ".min.js") { return; }
		if (documentIndexes[url]) { return; }

		// Interrupt execution
		var deferred = new $.Deferred();
		Debugger.interrupt(deferred);
		// Load document
		DocumentManager.getDocumentForPath(url.slice(7)).done(function (doc) {
			doc.url = doc.url || url;
			// Parse the document
			var index = createIndexForDocument(doc);
			// Set tracepoints, then continue execution
			index.setTracepoints().then(deferred.resolve);
		});
	}
	
	function onFunctionParsed(node, index) {
		var func = new FunctionNode(node);
		var parent = index.findFunctionAtLocation({ line: func.start.line, column: func.start.column });
		if (parent) {
			parent.addChild(func);
		} else {
			index.addFunction(func);
		}
	}

	function onVariableParsed(node, index) {
		if (node.type === 'ThisExpression') { node.name = "this"; }
		else if (node.type === 'VariableDeclarator') { node = node.id; }
		index.addVariable(node);
	}

	/** Actions **************************************************************/

	function parseString(code, options) {
		return esprima.parse(code, options);
	}

	function parseDocument(doc, options) {
		if (! doc) { return; }
		return parseString(doc.getText(), options);
	}

	function walkParseTree(tree, handlers, context) {
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

		var results = [];

		while (queue.length) {
			current = queue.shift();
			type    = current.type;
			
			if (type && handlers[type]) {
				var result = handlers[type](current, context);
				if (result) { results.push(result); }
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

		return $.when.apply(null, results).promise();
	}

	function createIndexForDocument(doc) {
		if (! doc || documentIndexes[doc.url]) { return; }

		return documentIndexes[doc.url] = new Index(doc, {
			FunctionDeclaration: onFunctionParsed,
			FunctionExpression:  onFunctionParsed,
			Identifier:          onVariableParsed,
			VariableDeclarator:  onVariableParsed,
			ThisExpression:      onVariableParsed
		});
	}

	function indexForDocument(doc) {
		if (! doc) { return; }
		return documentIndexes[doc.url];
	}

	/** Private Functions *******************************************************/

	/** Helper Functions *******************************************************/

	function locationIsBetween(location, start, end) {
		// Does not start before location
		if (! (start.line < location.line || (start.line === location.line && start.column < location.column))) { return false; }
		// Starts before, but does not end after location
		if (!   (end.line > location.line ||   (end.line === location.line &&   end.column > location.column))) { return false; }
		// Location is between start and end
		return true;
	}

	function loadEsprima() {
		if (typeof esprima !== 'undefined') { return; }
		$script = $("<script>").attr("src", require.toUrl("lib/esprima.js")).appendTo(window.document.head);
	}

	/** Init Functions *******************************************************/
	
	// init
	function init() {
		loadEsprima();
		$(Debugger).on("scriptRequested", onScriptRequested);
	}

	function unload() {
		$(Debugger).off("scriptRequested", onScriptRequested);
		if ($script) {
			$script.remove();
		}
	}

	// public methods
	exports.init   = init;
	exports.unload = unload;

	exports.parseString            = parseString;
	exports.parseDocument          = parseDocument;
	exports.walkParseTree          = walkParseTree;
	exports.createIndexForDocument = createIndexForDocument;
	exports.indexForDocument       = indexForDocument;
});
