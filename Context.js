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

	function listOpenDocuments() {
		console.log(DocumentManager.getAllOpenDocuments());
	}

	// Files	
	function onWorkingSetAdd(event, fileEntry) {
		console.log("> onWorkingSetAdd", fileEntry);
	}

	function onWorkingSetRemove(event, fileEntry) {
		console.log("> onWorkingSetRemove", fileEntry);
	}

	// Documents
	function onCurrentDocumentChange(event) {
		console.log("> onCurrentDocumentChange", arguments, DocumentManager.getCurrentDocument());
		var doc = DocumentManager.getCurrentDocument();
		if (! doc) { return; }
		$(doc).on("change", onChange);
		$(doc).on("deleted", onDeleted);
	}

	function onDocumentSaved(event, doc) {
		console.log("> onDocumentSaved", doc);
	}

	function onChange(event, doc, change) {
		console.log("> onChange", doc, change);
	}

	function onDeleted(event) {
		var doc = event.target;
		console.log("> onDeleted", doc);
	}

	var nextId = 1;
	function tag(editor) {
		if (! editor.id) {
			editor.id = nextId++;
		}
	}

	// Editors
	function onFocusedEditorChange(event, editor) {
		tag(editor);
		console.log("> onFocusedEditorChange", editor, editor.document.file.fullPath);
		
		var editor2 = EditorManager.getCurrentFullEditor();
		tag(editor2);
		console.log("getCurrentFullEditor", editor2);
		
		var editor3 = EditorManager.getFocusedEditor();
		tag(editor3);
		console.log("getFocusedEditor", editor3);
		
		var editors = EditorManager.getInlineEditors(editor2);
		console.log("getInlineEditors", editors);

		window.setTimeout(function () {
			var editor2 = EditorManager.getCurrentFullEditor();
			tag(editor2);
			console.log("getCurrentFullEditor", editor2);
			
			var editor3 = EditorManager.getFocusedEditor();
			tag(editor3);
			console.log("getFocusedEditor", editor3);
		
			var editors = EditorManager.getInlineEditors(editor2);
			console.log("getInlineEditors", editors);
		}, 500);
	}

	/** Init Functions *******************************************************/
	
	// init
	var $btnBreakEvents;
	function init() {
		listOpenDocuments();
		$(DocumentManager).on("currentDocumentChange", onCurrentDocumentChange);
		$(DocumentManager).on("documentSaved", onDocumentSaved);
		$(DocumentManager).on("workingSetAdd", onWorkingSetAdd);
		$(DocumentManager).on("workingSetRemove", onWorkingSetRemove);
		$(EditorManager).on("focusedEditorChange", onFocusedEditorChange);
	}

	// unload
	function unload() {
		$(DocumentManager).off("currentDocumentChange", onCurrentDocumentChange);
	}

	exports.init = init;
	exports.unload = unload;
});
