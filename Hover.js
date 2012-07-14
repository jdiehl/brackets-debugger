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
/*global define, brackets, $, less */

define(function (require, exports, module) {
	'use strict';

	var DocumentManager = brackets.getModule("document/DocumentManager");
	var EditorManager   = brackets.getModule("editor/EditorManager");
	var Inspector       = brackets.getModule("LiveDevelopment/Inspector/Inspector");

	var Parser = require("Parser");

	var hover = { cursor: null, token: null };
	var $popup;
	var tabWidth = 2;
	
	/** Helper Functions *****************************************************/
	
	function describeValue(value, level) {
		level = level || 0;

		if (value.value === null)       { return "null"; }
		if (value.type === "undefined") { return "undefined"; }
		if (value.type === "number")    { return value.value; }
		if (value.type === "string")    { return JSON.stringify(value.value); }
		if (value.type === "function")  { return value.description; }
		if (value.type === "object")    { return describeObject(value, level); }
		if (value.description)          { return value.description; }
		
		// Pretty print
		return JSON.stringify(value, undefined, tabWidth);
	}

	function describeObject(info, level) {
		if (! info.value) { return info.description; }

		var i, indentUnit = "", indent = "";
		for (i = 0; i < tabWidth; i++) { indentUnit += " "; }
		for (i = 0; i < level;    i++) { indent     += indentUnit; }

		var content = [];
		for (var key in info.value) {
			var line = indent + indentUnit;
			// Object key
			if (info.subtype !== 'array') { line += key + ": "; }
			line += describeValue(info.value[key], level + 1);
			content.push(line);
		}
		content = content.join(",\n");
		
		var b = info.subtype === 'array' ? ["[", "]"] : ["{", "}"];
		content = b[0] + (content.length > 1 ? "\n" + content + "\n" + indent : content) + b[1];
		
		return content;
	}

	function removePopup() {
		if ($popup) {
			$popup.remove();
			$popup = null;
		}
	}

	function showValue(value, line, fromCol, toCol, cmLinesNode, cm) {
		removePopup();
		
		// Create the popup with an ID for CSS
		var $popup = $("<div>").attr("id", "jdiehl-debugger-variable-value");
		// Make the text movable independent of the rest (the arrow) by wrapping it in another div
		var $text  = $("<div>").text(value).appendTo($popup);
		// Append the popup to a node compatible with "local" coordinates as used below
		$("> div:last", cmLinesNode).append($popup);

		// Prevent a weird effect when a variable is in the first column and the cursor is left of it
		if (toCol === 0) { toCol = 1; }
		// Get the pixel coordinates of the left and right end of the token
		var left   = cm.charCoords({ line: line, ch: fromCol }, "local");
		var right  = cm.charCoords({ line: line, ch: toCol   }, "local");
		// Right shift to the middle of the token
		left.x += Math.round((right.x - left.x) / 2);
		// Left shift so that the middle of the text is at the middle of the token
		left.x -= Math.round($popup.outerWidth() / 2);
		// Position the popup
		$popup.css({ left: left.x, top: left.y });

		// Minimum left coordinate, negative so the arrow does not overlap the rounded corner
		var minLeft = -8;
		// Shift the text part of the popup to the right if it is cut off
		if (left.x < minLeft) {
			// Setting margin-right = -1 * margin-left keeps left: 50% intact (for the arrow)
			$text.css({ 'margin-left': minLeft - left.x, 'margin-right': - (minLeft - left.x) });
		}
		
		return $popup;
	}
	
	function resolveVariableInTracepoint(variable, tracepoint) {
		var noGlobal = function (scope) { return scope.type !== "global"; };

		var result = new $.Deferred();

		var trace = tracepoint.trace[tracepoint.trace.length - 1];
		if (! trace || trace.callFrames.length === 0) { return result.reject(); }
		var callFrameIndex = 0;
		trace.resolveCallFrame(callFrameIndex, noGlobal).done(function () {
			var scopeChain = trace.callFrames[callFrameIndex].scopeChain;
			for (var i = 0; i < scopeChain.length; i++) {
				var vars = scopeChain[i].resolved;
				if (vars && vars[variable]) {
					return resolveVariable(vars[variable]).done(result.resolve);
				}
			}
			result.reject();
		});

		return result.promise();
	}

	function resolveVariable(value, cache) {
		if (! cache) { cache = {}; }
		
		var result = new $.Deferred();
		
		if (! value.objectId) {
			result.resolve(value);
		}
		else if (cache[value.objectId]) {
			result.resolve(cache[value.objectId]);
		}
		else {
			cache[value.objectId] = value;
			Inspector.Runtime.getProperties(value.objectId, true, function (res) {
				console.log(res);

				var pending = [];
				var resolved = value.value = {};
				for (var i in res.result) {
					var info = res.result[i];
					if (! info.enumerable) { continue; }
					resolved[info.name] = info.value;
					pending.push(resolveVariable(info.value));
				}

				$.when.apply(null, pending).done(function () {
					result.resolve(value);
				});
			});
		}

		return result.promise();
	}

	function findWrappingFunction(functions, cursor, token) {
		var fn;
		
		for (var i = 0; i < functions.length; i++) {
			var candidate    = functions[i];
			var start        = candidate.loc.start, end = candidate.loc.end;
			var startsBefore = start.line - 1 < cursor.line || (start.line - 1 === cursor.line && start.column < token.start);
			var endsAfter    = end.line - 1 > cursor.line || (end.line - 1 === cursor.line && end.column > token.end);

			// Assumption: any later function that surrounds the variable
			// is inside any previous surrounding function => just replace fn
			if (startsBefore && endsAfter) { fn = candidate; }
		}

		return fn;
	}

	/** Event Handlers *******************************************************/
	
	function onLinesMouseMove(event) {
		onPixelHover({ x: event.clientX, y: event.clientY }, event.target);
	}
	
	function onLinesMouseOut() {
		onPixelHover(null);
	}

	function onPixelHover(pixel, node) {
		var cm     = EditorManager.getCurrentFullEditor()._codeMirror;

		var cursor = pixel ? cm.coordsChar({ x: pixel.x + 4, y: pixel.y }) : null;

		// Same cursor position hovered as before: abort
		if (hover.cursor &&
			cursor &&
			cursor.ch   === hover.cursor.ch &&
			cursor.line === hover.cursor.line
		) { return; }
		
		hover.cursor = cursor;
		onCursorHover(cursor, node, cm);
	}

	function onCursorHover(cursor, cmLinesNode, cm) {
		var token = cursor ? cm.getTokenAt(cursor) : null;

		// Same token hovered as before: abort
		if (hover.token &&
			token &&
			token.string    === hover.token.string &&
			token.className === hover.token.className &&
			token.start     === hover.token.start &&
			token.end       === hover.token.end
		) { return; }

		hover.token = token;
		onTokenHover(token, cursor, cmLinesNode, cm);
	}

	function onTokenHover(token, cursor, cmLinesNode, cm) {
		// Close the popup
		removePopup();

		// No token hovered? We're done
		if (! token) { return; }

		// Get the functions and variables of the current document or abort
		var url       = DocumentManager.getCurrentDocument().url;
		var details   = Parser.getCacheForUrl(url);
		var variables = details.variables;
		var functions = details.functions;
		if (! variables || ! functions) { return; }

		// Find the variable for this token, else abort
		// CodeMirror lines are 0-based, Esprima lines are 1-based
		var line     = cursor.line + 1;
		var column   = token.start;
		var variable = variables[line] ? variables[line][column] : null;
		if (! variable) { return; }

		// Find the function surrounding the variable, else abort
		var fn = findWrappingFunction(functions, cursor, token);
		if (! fn) { return; }

		var resolveBefore = resolveVariableInTracepoint(variable, fn.tracepoints[0]);
		var resolveAfter  = resolveVariableInTracepoint(variable, fn.tracepoints[1]);
		$.when(resolveBefore, resolveAfter).done(function (before, after) {
			before = describeValue(before);
			after  = describeValue(after);
			if (before !== after) {
				before += " ↦ " + after;
			}
			$popup = showValue(before, cursor.line, token.start, token.end, cmLinesNode, cm);
		});
	}

	function onCurrentDocumentChange() {
		removePopup();
	}

	/** Init Functions *******************************************************/
	
	// init
	function init() {
		// register for debugger events
		$(".CodeMirror-lines")
			.on("mousemove", onLinesMouseMove)
			.on("mouseout", onLinesMouseOut);

		$(DocumentManager).on("currentDocumentChange", onCurrentDocumentChange);
		setTimeout(onCurrentDocumentChange, 0);
	}

	// unload
	function unload() {
		$(DocumentManager).off("currentDocumentChange", onCurrentDocumentChange);
		
		$(".CodeMirror-lines")
			.off("mousemove", onLinesMouseMove)
			.off("mouseout", onLinesMouseOut);
	}

	exports.init = init;
	exports.unload = unload;

	$(init);
});
