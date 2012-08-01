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
/*global define, brackets, $ */

define(function (require, exports, module) {
	'use strict';

	var DocumentManager = brackets.getModule("document/DocumentManager");
	var EditorManager   = brackets.getModule("editor/EditorManager");
	var ScriptAgent     = brackets.getModule("LiveDevelopment/Agents/ScriptAgent");
	var GotoAgent       = brackets.getModule("LiveDevelopment/Agents/GotoAgent");
	var DOMAgent        = brackets.getModule("LiveDevelopment/Agents/DOMAgent");

	var Debugger = require("Debugger");
	var Panel    = require("Panel");

	var tabId = "jdiehl-debugger-traces";
	
	var $tab, $events, $node, $tree;

	function onNodeClick(event) {
		event.preventDefault();
		var node = $node.data("node");
		var location = node ? node.location : 0;

		GotoAgent.open(DOMAgent.url, location);
	}

	function _twoDigits(number) {
		return String(100 + number).slice(-2);
	}

	function _formatTime(time) {
		return [time.getHours(), time.getMinutes(), time.getSeconds()].map(_twoDigits).join(":");
	}

	function _nodeDescription(node) {
		var name = node.name.toLowerCase();
		if (name[0] === "#") name = name.substr(1);
		var r = "<" + name;
		if (node.attributes.id) {
			r += "#" + node.attributes.id;
		}
		r += ">";
		return r;
	}

	function _showEventTrace(e, trace) {
		$(trace).off("change", _showEventTrace);
		var $event = $('<div class="fresh event">');
		var eventName = trace.event;
		var className = trace.callFrames[0].this.className;
		if (className === "Window" || className === "Document") {
			eventName = "<" + className.toLowerCase() + ">" + eventName;
		} else {
			trace.resolveTargetNode().then(function (node) {
				$eventDesc.text(_nodeDescription(node) + trace.event);
			});
		}
		var $eventDesc = $('<div class="type">').text(eventName);
		$event.data('trace', trace)
			.append($('<div class="time">').text(_formatTime(trace.date)))
			.append($eventDesc)
			.prependTo($events)
			.removeClassDelayed("fresh");
	}

	function onEventTrace(e, trace) {
		$(trace).on("change", _showEventTrace);
	}

	function _traceChildrenForTree(parent) {
		var children = [];

		for (var i = 0; i < parent.children.length; i++) {
			var trace = parent.children[i];
			if (!trace.script()) break;

			var child = {
				data: "[" + trace.locationName() + "] " + trace.functionName(),
				metadata: { trace: trace }
			};
			if (trace.children && trace.children.length > 0) {
				child.state = "open";
				child.children = _traceChildrenForTree(trace, false);
			}
			children.push(child);
		}

		return children;
	}

	function _treeDataProvider(treeNode, callback) {
		var parent = (treeNode === -1) ? { children: [currentEventTrace] } : treeNode.data('trace');
		var children = _traceChildrenForTree(parent);
		callback(children);
	}

	function setupNode($node) {
		$node.data("node", null);
		$node.empty();

		if (! currentEventTrace) { return; }

		var className = currentEventTrace.callFrames[0].this.className;
		if (className === "Window" || className === "Document") {
			$node.text("<" + className.toLowerCase() + ">");
		} else {
			currentEventTrace.resolveTargetNode().then(function (node) {
				$node.text(_nodeDescription(node));
				$node.data("node", node);
			});
		}
	}
	
	function setupTree($tree) {
		$tree.empty();
		
		if (! currentEventTrace) { return; }

		// Mostly taken from Brackets' ProjectManager.js
		$tree.jstree({
			core : { animation: 0 },
			plugins : ["ui", "themes", "json_data"],
			json_data : { data: _treeDataProvider, correct_state: false },
			themes : { theme: "brackets", url: "styles/jsTreeTheme.css", dots: false, icons: false }
		})
		.bind("mousedown.jstree", function (event) {
			event.preventDefault();
			if ($(event.target).is(".jstree-icon")) { return; }
			onTraceSelected($(event.target).closest('li').data('trace'));
		});
	}

	function onTraceSelected(trace) {
		if (! trace) { return; }
		var l = trace.location;
		GotoAgent.open(l.url, { line: l.lineNumber, ch: l.columnNumber });
	}

	var currentEventTrace;
	var $activeEventEntry;
	
	function onEventClicked(e) {
		e.preventDefault();
		if ($activeEventEntry) { $activeEventEntry.removeClass("active"); }
		$activeEventEntry = $(e.currentTarget).addClass("active");
		currentEventTrace = $activeEventEntry.data("trace");
		setupNode($node);
		setupTree($tree);
	}

	// init
	function init() {
		// configure tab content
		$tab = $('<div class="table-container quiet-scrollbars">').attr('id', tabId);
		$events = $('<div class="events">').on('mousedown', 'div.event', onEventClicked).appendTo($tab);
		$node = $('<div class="node">').appendTo($tab);
		$node.on("click", onNodeClick);
		$tree = $('<div class="tree quiet-scrollbars">').appendTo($tab);
		Panel.addTab(tabId, "Events", $tab);

		$(Debugger).on("eventTrace", onEventTrace);
	}

	function unload() {
	}

	function reset() {
		$events.empty();
	}

	// public methods
	exports.init = init;
	exports.unload = unload;
	exports.reset = reset;
});
