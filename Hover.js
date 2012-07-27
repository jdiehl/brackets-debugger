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
	var ScriptAgent     = brackets.getModule("LiveDevelopment/Agents/ScriptAgent");
	var GotoAgent       = brackets.getModule("LiveDevelopment/Agents/GotoAgent");

	var Parser = require("Parser");

	// config
	var tabWidth    = 2;
	var maxChildren = 5;
	var maxDepth    = 2;

	// state
	var hover = { cursor: null, token: null };
	var $popup;
	
	/** Helper Functions *****************************************************/
	
	function describeValue(value, level) {
		if (! level) { level = 0; }

		if (value.value === null)       { return "null"; }
		if (value.type === "undefined") { return "undefined"; }
		if (value.type === "boolean")   { return value.value; }
		if (value.type === "number")    { return value.value; }
		if (value.type === "string")    { return JSON.stringify(value.value); }
		if (value.type === "function")  { return describeObject(value, level); }
		if (value.type === "object")    { return describeObject(value, level); }
		if (value.description)          { return "<" + value.description + ">"; }
		
		// Pretty print
		return JSON.stringify(value, undefined, tabWidth);
	}

	function describeObject(info, level) {
		if (! info.value) { return "<" + info.description + ">"; }

		var i, indentUnit = "", indent = "";
		for (i = 0; i < tabWidth; i++) { indentUnit += " "; }
		for (i = 0; i < level;    i++) { indent     += indentUnit; }

		var content = [];
		for (var key in info.value) {
			var value = info.value[key];
			var line = indent + indentUnit;
			if (value.special === 'abbreviated') {
				line += "...";
			} else {
				// Object key
				if (info.subtype !== 'array') { line += key + ": "; }
				line += describeValue(value, level + 1);
			}
			content.push(line);
		}
		content = content.join(",\n");

		var b = info.subtype === 'array' ? ["[", "]"] : ["{", "}"];
		content = b[0] + (content.length > 1 ? "\n" + content + "\n" + indent : content) + b[1];

		if (info.subtype !== 'array' && info.className && info.className !== "Object") {
			content = "<" + info.className + "> " + content;
		}

		if (info.type === "function") {
			var description = info.description.replace(/[\r\n]/g, " ").replace(/[\r\n\t ]*\{.*$/, " { ... }");
			if (content !== "{}") { description += "\n" + indent + "Properties: " + content; }
			content = description;
		}
		
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
		var callFrame = trace.callFrames[callFrameIndex];

		if (variable === "this" && callFrame.this) {
			resolveVariable(callFrame.this).done(result.resolve);
		}
		else {
			trace.resolveCallFrame(callFrameIndex).done(function () {
				var scopeChain = callFrame.scopeChain;
				for (var i = 0; i < scopeChain.length; i++) {
					var vars = scopeChain[i].resolved;
					if (vars && vars[variable]) {
						resolveVariable(vars[variable]).done(result.resolve);
						return;
					}
				}
				result.reject();
			});
		}

		return result.promise();
	}

	function resolveVariable(value, cache, depth) {
		if (! cache) { cache = {}; }
		if (! depth) { depth = 0; }
		
		var result = new $.Deferred();

		var ignore = !value || (value.type == "object" && (value.className == "Window" || value.className == "Document"));
		if (ignore || ! value.objectId) {
			result.resolve(value);
		}
		else if (cache[value.objectId]) {
			result.resolve(cache[value.objectId]);
		}
		else {
			cache[value.objectId] = value;
			if (depth < maxDepth) {
				Inspector.Runtime.getProperties(value.objectId, true, function (res) {
					var pending = [];
					var resolved = value.value = {};

					var used = 0;
					for (var i = 0; i < res.result.length; i++) {
						var info = res.result[i];
						if (! info.enumerable) { continue; }
						if (++used > maxChildren) {
							resolved[""] = { special: "abbreviated" };
							break;
						}
						resolved[info.name] = info.value;
						pending.push(resolveVariable(info.value, cache, depth + 1));
					}

					$.when.apply(null, pending).done(function () {
						if (value.type === "function") {
							Inspector.Debugger.getFunctionDetails(value.objectId, function (res) {
								value.details = res.details;
								result.resolve(value);
							});
						}
						else {
							result.resolve(value);
						}
					});
				});
			} else {
				result.resolve(value);
			}
		}

		return result.promise();
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

		// Tokens don't include line information
		if (token) { token.line = cursor.line; }

		// Same token hovered as before: abort
		if (hover.token &&
			token &&
			token.string    === hover.token.string &&
			token.className === hover.token.className &&
			token.start     === hover.token.start &&
			token.end       === hover.token.end &&
			token.line      === hover.token.line
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
		var doc       = DocumentManager.getCurrentDocument();
		var index     = Parser.indexForDocument(doc);
		if (! index) { return; }
		
		var variables = index.variables;
		var functions = index.functions;
		if (! variables || ! functions) { return; }

		var location = { line: cursor.line, column: token.start };

		// Find the variable for this token, else abort
		var variable = index.findVariableAtLocation(location);
		if (! variable) { return; }

		// Find the function surrounding the variable, else abort
		var fn = index.findFunctionAtLocation(location);
		if (! fn) { return; }

		var resolveBefore = resolveVariableInTracepoint(variable, fn.tracepoints[0]);
		var resolveAfter  = resolveVariableInTracepoint(variable, fn.tracepoints[1]);
		$.when(resolveBefore, resolveAfter).done(function (before, after) {
			if (after.details && after.details.location) {
				token.location = after.details.location;
			} else if (before.details && before.details.location) {
				token.location = before.details.location;
			}
			
			before = describeValue(before);
			after  = describeValue(after);
			if (before !== after) {
				before += " ↦ " + after;
			}

			$popup = showValue(before, cursor.line, token.start, token.end, cmLinesNode, cm);
		});
	}

	function onLinesClick(event) {
		var hot = event.metaKey || event.ctrlKey;
		if (! hot || ! hover.token || ! hover.token.location) { return; }
		var location = hover.token.location;
		
		var url = ScriptAgent.scriptWithId(location.scriptId).url;
		GotoAgent.open(url, { line: location.lineNumber, ch: location.columnNumber });
		
		event.preventDefault();
		return false;
	}

	function onCurrentDocumentChange() {
		removePopup();
		$(".CodeMirror-lines")
			.on("mousemove", onLinesMouseMove)
			.on("mouseout", onLinesMouseOut)
			.on("click", onLinesClick);
	}

	/** Init Functions *******************************************************/
	
	// init
	function init() {
		// register for debugger events

		$(DocumentManager).on("currentDocumentChange", onCurrentDocumentChange);
		setTimeout(onCurrentDocumentChange, 0);
	}

	// unload
	function unload() {
		$(DocumentManager).off("currentDocumentChange", onCurrentDocumentChange);
		
		$(".CodeMirror-lines")
			.off("mousemove", onLinesMouseMove)
			.off("mouseout", onLinesMouseOut)
			.off("click", onLinesClick);
	}

	exports.init = init;
	exports.unload = unload;
});
