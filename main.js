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
	var ScriptAgent     = brackets.getModule("LiveDevelopment/Agents/ScriptAgent");
	var GotoAgent       = brackets.getModule("LiveDevelopment/Agents/GotoAgent");

	var ENABLE_EVENTS      = true;
	var ENABLE_TRACEPOINTS = false;
	var ENABLE_HOVER       = false;

	// var Context    = require("Context");
	var Debugger   = require("Debugger");
	var Panel      = require("Panel");
	var ConsoleTab = require("ConsoleTab");
	var TraceTab   = require("TraceTab");
	var Breakpoint = require("Breakpoint");
	var Parser     = require("Parser");
	var Hover      = require("Hover");
	var Trace      = require("Trace");

	var $style;
	var traceLineTimeouts = {};

	/** Helper Functions *****************************************************/

	// Like removeClass, but with a delay to trigger CSS transition animations
	$.fn.removeClassDelayed = function (klass) {
		var ctx = this;
		window.setTimeout(function () { $(ctx).removeClass(klass); }, 0);
		return ctx;
	};

	function _editorForURL(url) {
		var doc = DocumentManager.getCurrentDocument();
		if (doc && doc.url === url) {
			return EditorManager.getCurrentFullEditor();
		}
		return undefined;
	}

	function _editorForLocation(location) {
		return _editorForURL(_urlForLocation(location));
	}

	function _urlForLocation(location) {
		var url = location.url;
		if (url) { return url; }
		var script = ScriptAgent.scriptWithId(location.scriptId);
		if (! script) { return undefined; }
		return script.url;
	}
	
	/** Find this extension's directory relative to the brackets root */
	function _extensionDirForBrowser() {
		var bracketsIndex = window.location.pathname;
		var bracketsDir   = bracketsIndex.substr(0, bracketsIndex.lastIndexOf('/') + 1);
		var extensionDir  = bracketsDir + require.toUrl('./');

		return extensionDir;
	}

	/** Loads a less file as CSS into the document */
	function _loadLessFile(file, dir) {
		// Load the Less code
		$.get(dir + file, function (code) {
			// Parse it
			var parser = new less.Parser({ filename: file, paths: [dir] });
			parser.parse(code, function onParse(err, tree) {
				console.assert(!err, err);
				// Convert it to CSS and append that to the document head
				$("<style>").text(tree.toCSS()).appendTo(window.document.head);
			});
		});
	}

    /** Sets a line class and removes it after a delay */
	function setTemporaryLineClass(editor, line, className, delay) {
		// get CodeMirror's line elements
		// this is much faster than working with the codemirror api
		var $codeLines = $(".CodeMirror-lines > div > div:last > pre");

		// add the class directly
		var $line = $codeLines.eq(line);
		$line.addClass(className);

		// Stop any previous attempts of removing the line class
		window.clearTimeout(traceLineTimeouts[line]);

		// Remove the line class after the given delay
		traceLineTimeouts[line] = window.setTimeout(function () {
			$line.attr("class", null);
			delete traceLineTimeouts[line];
		}, delay);
	}

	/** Event Handlers *******************************************************/
	
	function onLineNumberClick(event) {
		// Todo: find the editor that was actually clicked
		var editor = EditorManager.getCurrentFullEditor();
		var pos    = editor._codeMirror.coordsChar({ x: event.clientX, y: event.clientY });
		
		var location = { url: editor.document.url, lineNumber: pos.line };
		Debugger.toggleBreakpoint(location);
	}

	function onSetBreakpoint(event, res) {
		// res = {breakpoint, location}
		var editor = _editorForLocation(res.location);
		if (! editor) return;
		if (res.breakpoint.haltOnPause) {
			editor._codeMirror.setMarker(res.location.lineNumber, null, "breakpoint");
		}

		// compute and attach the file offset of the breakpoint
		res.location.offset = editor.indexFromPos({ line: res.location.lineNumber, ch: res.location.columnNumber });
	}

	function onRemoveBreakpoint(event, location) {
		var editor = _editorForLocation(location);
		if (! editor) return;
		editor._codeMirror.clearMarker(location.lineNumber, null, "breakpoint");
	}

	function onTrace(event, tracepoint) {
		var location = tracepoint.resolvedLocations ? tracepoint.resolvedLocations[0] : tracepoint.location;
		var editor = _editorForLocation(location);
		if (editor) {
			setTemporaryLineClass(editor, location.lineNumber, "trace", 5000);
		}
	}

	function onPaused(event, res) {
		var url = _urlForLocation(res.location);
		if (! url) { return; }
		var trip = GotoAgent.open(url, { line: res.location.lineNumber, ch: res.location.columnNumber }, true);
		if (! trip) { return; }
		trip.done(function () {
			EditorManager.getCurrentFullEditor()._codeMirror.setLineClass(res.location.lineNumber, "paused");
		});
	}

	function onReload(event) {
		if (ENABLE_TRACEPOINTS) {
			TraceTab.reset();
		}
	}

	function onResumed(event, res) {
		var editor = _editorForLocation(res.location);
		if (! editor) { return; }
		editor._codeMirror.setLineClass(res.location.lineNumber);
	}

	function onToggleBreakEvents() {
		var flag = !Debugger.breakOnTracepoints();
		Debugger.setBreakOnTracepoints(flag);
		$btnBreakEvents.toggleClass("enabled", flag);
	}

	/** Init Functions *******************************************************/
	
	// init
	var $btnBreakEvents;
	function init() {
		// enable experimental agents
		var ld = brackets.getModule("LiveDevelopment/LiveDevelopment");
		ld.enableAgent("script");
		ld.enableAgent("highlight");
		ld.enableAgent("goto");
		ld.enableAgent("edit");

		// load styles
		_loadLessFile("debugger.less", _extensionDirForBrowser());

		// init modules
		Debugger.init();
		Breakpoint.init();
		Panel.init();
		ConsoleTab.init();
		Trace.init();
		if (ENABLE_TRACEPOINTS || ENABLE_EVENTS) {
			TraceTab.init();
		}
		if (ENABLE_TRACEPOINTS) {
			Parser.init();
			if (ENABLE_HOVER) {
				Hover.init();
			}
		}

		// register for debugger events
		var $Debugger = $(Debugger);
		$Debugger.on("setBreakpoint", onSetBreakpoint);
		$Debugger.on("removeBreakpoint", onRemoveBreakpoint);
		$Debugger.on("paused", onPaused);
		$Debugger.on("resumed", onResumed);
		$Debugger.on("reload", onReload);
		$Debugger.on("trace", onTrace);

		// register for code mirror click events
		// Todo: use CodeMirror's onGutterClick
		// Then we would know which editor was clicked (inline or full)
		// Right now this would be buggy, though: https://github.com/adobe/brackets/issues/1251
		$("body").on("click", ".CodeMirror-gutter pre", onLineNumberClick);
		
		if (ENABLE_TRACEPOINTS) {
			$btnBreakEvents = $("<a>").text("❚❚").attr({ href: "#", id: "jdiehl-debugger-breakevents" });
			$btnBreakEvents.click(onToggleBreakEvents);
			$btnBreakEvents.insertBefore('#main-toolbar .buttons #toolbar-go-live');
		}
	}

	// unload
	function unload() {
		if (ENABLE_TRACEPOINTS || ENABLE_EVENTS) {
			TraceTab.unload();
		}
		if (ENABLE_TRACEPOINTS) {
			if (ENABLE_HOVER) {
				Hover.unload();
			}
			Parser.unload();
		}
		if (ENABLE_EVENTS) {
			$btnBreakEvents.remove();
		}
		ConsoleTab.unload();
		Panel.unload();
		Breakpoint.unload();
		Debugger.unload();
		Trace.unload();
		$style.remove();
		$("body").off("click", ".CodeMirror-gutter pre", onLineNumberClick);
	}

	exports.init = init;
	exports.unload = unload;

	$(init);
});
