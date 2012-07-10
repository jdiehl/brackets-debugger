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

	var Console    = require("Console");
	var Debugger   = require("Debugger");
	var Breakpoint = require("Breakpoint");
	var Parser     = require("Parser");

	var $style;
	var traceLineTimeouts = {};
	var tracepointsForUrl = {};

	/** Helper Functions *****************************************************/
	
	function _editorForURL(url) {
		var doc = DocumentManager.getCurrentDocument();
		if (doc && doc.url === url) {
			return EditorManager.getCurrentFullEditor();
		} else {
			console.log("No editor for url", url);
		}
		return null;
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

	// Taken from LiveDevelopment.js - this should REALLY be somewhere else
    /** Augments the given Brackets document with information that's useful for live development. */
    function _setDocInfo(doc) {
        // FUTURE: some of these things should just be moved into core Document; others should
        // be in a LiveDevelopment-specific object attached to the doc.
        var matches = /^(.*\/)(.+\.([^.]+))$/.exec(doc.file.fullPath);
        if (matches) {
            var prefix = "file://";
            
            // The file.fullPath on Windows starts with a drive letter ("C:").
            // In order to make it a valid file: URL we need to add an
            // additional slash to the prefix.
            if (brackets.platform === "win") {
                prefix += "/";
            }
            
            doc.extension = matches[3];
            doc.url = encodeURI(prefix + doc.file.fullPath);

            // the root represents the document that should be displayed in the browser
            // for live development (the file for HTML files, index.html for others)
            var fileName = /^html?$/.test(matches[3]) ? matches[2] : "index.html";
            doc.root = {url: encodeURI(prefix + matches[1] + fileName)};
        }
    }

    /** Sets a line class and removes it after a delay */
	function setTemporaryLineClass(editor, line, klass, delay) {
		// Make sure no other line class or previous trace class is in the way
		// Might also happen when the same tracepoint is hit twice quickly
		editor._codeMirror.setLineClass(line);
		// Set the trace class. This triggers an animation in CSS since the <pre> tag is regenerated
		editor._codeMirror.setLineClass(line, "trace");
		// Stop any previous attempts of removing the line class
		window.clearTimeout(traceLineTimeouts[line]);
		// Remove the line class after one second
		// This is necessary because the animation is triggered when the <pre> tag is rewritten
		// This happens over and over again on cursor activity, or when the document is changed, etc.
		traceLineTimeouts[line] = window.setTimeout(function () {
			delete traceLineTimeouts[line];
			editor._codeMirror.setLineClass(line);
		}, delay);
	}

	function setFunctionTracepoints(url, node) {
		// Remember the tracepoints
		var tracepoints = tracepointsForUrl[url] = [];

		// Name of the function
		var name  = node.id ? node.id.name : "<anonymous>";
		
		// Now add two tracepoints, one at the beginning, one at the end of the function
		for (var key in node.loc) {
			var loc = node.loc[key];
			var location = {
				url: url,
				// Esprima lines are 1-based
				lineNumber: loc.line - 1,
				// The end tracepoint needs be before }, not after, else it's hit right with the first one
				columnNumber: key === 'end' ? loc.column - 1 : loc.column
			};
			var tracepoint = Debugger.setTracepoint(location);
			tracepoints.push(tracepoint);
			$(tracepoint).on('set', function (event, res) {
				console.log("Tracepoint set for " + name + "() in", url.replace(/^.*\//, ''), "line", res.breakpoint.location.lineNumber);
			});
		}
	}

	function removeFunctionTracepoints(url) {
		// Remove the old tracepoints
		if (tracepointsForUrl[url]) {
			$.each(tracepointsForUrl[url], function (index, tracepoint) {
				tracepoint.remove();
			});
		}
	}

	function parseDocument(doc) {
		if (! doc || doc.extension !== 'js') { return; }

		console.groupCollapsed("Parsing", doc.file.name);

		removeFunctionTracepoints(doc.url);

		// Loc: also store locations (line, column)
		// Range: index-based ranges
		var options = { loc: true, range: true };
		var code    = doc.getText();
		var tree    = Parser.parse(code, options);

		// var functions = _functionsForUrl[doc.url] = [];
		
		Parser.findFunctions(tree, function (node) {
			// functions.push(node);
			// Name, if given
			var name  = node.id ? node.id.name : "<anonymous>";
			// Location as objects with .line and .column
			var start = node.loc.start, end = node.loc.end;
			// Location as indexes
			var from  = node.range[0], to = node.range[1];
			
			console.log("Found function " + name + "() in lines " + start.line + "-" + end.line, node);
			
			var excerpt;
			if (to - from > 100) {
				excerpt = code.slice(from, from + 49) + '...' + code.slice(to - 49, to);
			} else {
				excerpt = code.slice(from, to);
			}
			console.log(excerpt);
			
			setFunctionTracepoints(doc.url, node);
		});

		console.groupEnd();
	}

	/** Event Handlers *******************************************************/
	
	function onLineNumberClick(event) {
		var $elem = $(event.currentTarget);
		var doc = DocumentManager.getCurrentDocument();
		var location = { url: doc.url, lineNumber: $elem.index() };
		Debugger.toggleBreakpoint(location);
	}

	function onSetBreakpoint(event, location) {
		var editor = _editorForURL(location.url);
		if (! editor) return;
		editor._codeMirror.setMarker(location.lineNumber, null, "breakpoint");
	}

	function onRemoveBreakpoint(event, location) {
		var editor = _editorForURL(location.url);
		if (! editor) return;
		editor._codeMirror.clearMarker(location.lineNumber, null, "breakpoint");
	}

	function onPaused(event, res) {
		var editor = _editorForURL(res.location.url);
		if (! editor) { return; }
		editor.setCursorPos(res.location.lineNumber, res.location.columnNumber);
		editor._codeMirror.setLineClass(res.location.lineNumber, "paused");
	}

	function onResumed(event, res) {
		if (res.location) {
			var editor = _editorForURL(res.location.url);
			if (! editor) { return; }
			editor._codeMirror.setLineClass(res.location.lineNumber);
		}
	}

	function onTrace(event, breakpoint) {
		var editor = _editorForURL(breakpoint.location.url);
		if (! editor) { return; }

		setTemporaryLineClass(editor, breakpoint.location.lineNumber, "trace", 1000);
	}

	function onCurrentDocumentChange() {
		parseDocument(DocumentManager.getCurrentDocument());
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

		// load styles
		_loadLessFile("debugger.less", _extensionDirForBrowser());

		// init modules
		Debugger.init();
		Console.init();
		Breakpoint.init();
		Parser.init();

		// register for debugger events
		var $Debugger = $(Debugger);
		$Debugger.on("setBreakpoint", onSetBreakpoint);
		$Debugger.on("removeBreakpoint", onRemoveBreakpoint);
		$Debugger.on("paused", onPaused);
		$Debugger.on("resumed", onResumed);
		$Debugger.on("trace", onTrace);

		// register for code mirror click events
		$("body").on("click", ".CodeMirror-gutter-text pre", onLineNumberClick);

		$btnBreakEvents = $("<a>").text("❚❚").attr({ href: "#", id: "jdiehl-debugger-breakevents" });
		$btnBreakEvents.click(onToggleBreakEvents);
		$btnBreakEvents.insertBefore('#main-toolbar .buttons #toolbar-go-live');

		$(DocumentManager).on("currentDocumentChange", onCurrentDocumentChange);
		setTimeout(onCurrentDocumentChange, 0);

		// Yes, there is DocumentManager.getAllOpenDocuments
		// However not all files in the working set are actually "open" for some reason
		// $.each(DocumentManager.getWorkingSet(), function (index, fileEntry) {
		// 	if (! fileEntry.isFile || fileEntry.fullPath.replace(/^.*\./, '') !== 'js') { return; }
		// 	DocumentManager.getDocumentForPath(fileEntry.fullPath).done(function (doc) {
		// 		_setDocInfo(doc);
		// 		parseDocument(doc);
		// 	});
		// });
	}

	// unload
	function unload() {
		$(DocumentManager).off("currentDocumentChange", onCurrentDocumentChange);
		
		Console.unload();
		Debugger.unload();
		Breakpoint.unload();
		Parser.unload();
		$style.remove();
		$("body").off("click", ".CodeMirror-gutter-text pre", onLineNumberClick);
	}

	exports.init = init;
	exports.unload = unload;

	$(init);
});
