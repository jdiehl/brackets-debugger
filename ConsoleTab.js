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

	var Inspector = brackets.getModule("LiveDevelopment/Inspector/Inspector");
	var EditorManager = brackets.getModule("editor/EditorManager");

	var Debugger = require("Debugger");
	var Panel = require("Panel");

	var tabId = "jdiehl-debugger-console";
	
	var $tab, $output, $prompt;
	var $btnPause, $btnContinue, $btnStepOver, $btnStepInto, $btnStepOut;
	var _lastMessage;

	// add a message
	function _add(level, message, wasThrown) {
		var $msg = $("<div>");
		$msg.addClass(level);
		if (wasThrown) $msg.addClass("error");

		switch (level) {

		// command
		case "out":
			$msg.text(message);
			break;

		// response
		case "in":
			if (message.text) {
				$msg.text(message.text);
			} else if (message.description) {
				$msg.text(message.description);
			} else {
				if (message.type === "undefined" || message.type === "null") {
					$msg.text(message.type);
					$msg.addClass("null");
				} else {
					$msg.text("[" + message.type + "]");
				}
			}
			break;

		// log message
		default:
			$msg.text(message.text);
		}

		$output.append($msg);
		$output.scrollTop($msg.offset().top);
	}

	// on prompt keypress
	var _history = [];
	var _curHistory;
	function _onPromptKeypress(e) {

		switch (e.keyCode) {
		case 13: // return
			_curHistory = undefined;
			var command = $prompt.val();
			$prompt.val("");
			_add("out", command);
			_history.push(command);
			Debugger.evaluate(command, function (res) {
				_add("in", res.result, res.wasThrown);
			});
			break;

		case 38: // up
			if (_curHistory !== undefined || $prompt.val().length === 0) {
				_curHistory = _curHistory === undefined ? _history.length - 1 : _curHistory - 1;
				if (_curHistory < 0) {
					_curHistory = 0;
				} else {
					$prompt.val(_history[_curHistory]);
				}
			}
			break;

		case 40: // down
			if (_curHistory !== undefined) {
				_curHistory++;
				if (_curHistory > _history.length - 1) {
					_curHistory = _history.length - 1;
				} else {
					$prompt.val(_history[_curHistory]);
				}
			}
			break;

		default:
			_curHistory = undefined;
		}
	}

	function _onToolbarButtonPressed(event) {
		event.preventDefault();
		var method = this.getAttribute("class").replace(/\s*/, '');
		Debugger[method]();
	}

	// WebInspector Event: Console.messageAdded
	function _onMessageAdded(res) {
		// res = {message}
		_lastMessage = res.message;
		_add(_lastMessage.level, _lastMessage);
	}

	// WebInspector Event: Console.messageRepeatCountUpdated
	function _onMessageRepeatCountUpdated(res) {
		// res = {count}
		if (_lastMessage) {
			_add(_lastMessage.level, _lastMessage);
		}
	}

	// WebInspector Event: Console.messagesCleared
	function _onMessagesCleared(res) {
		// res = {}
		_lastMessage = null;
		$output.empty();
	}

	function _onConnect() {
		Inspector.Console.enable();
	}

	// init
	function init() {
		// configure the tab content
		$tab    = $('<div class="table-container">').attr('id', tabId);
		$output = $('<div class="output">').appendTo($tab);
		$prompt = $('<input class="prompt">').on("keyup", _onPromptKeypress).appendTo($tab);
		Panel.addTab(tabId, "Console", $tab);
		
		// configure the toolbar
		$btnPause    = Panel.addButton($('<button class="pause" title="Pause">').on("mousedown", _onToolbarButtonPressed));
		$btnContinue = Panel.addButton($('<button class="resume" title="Resume">').on("mousedown", _onToolbarButtonPressed));
		$btnStepOver = Panel.addButton($('<button class="stepOver" title="Step Over">').on("mousedown", _onToolbarButtonPressed));
		$btnStepInto = Panel.addButton($('<button class="stepInto" title="Step Into">').on("mousedown", _onToolbarButtonPressed));
		$btnStepOut  = Panel.addButton($('<button class="stepOut" title="Step Out">').on("mousedown", _onToolbarButtonPressed));

		// configure the inspector
		Inspector.on("connect", _onConnect);
		Inspector.on("Console.messageAdded", _onMessageAdded);
		Inspector.on("Console.messageRepeatCountUpdated", _onMessageRepeatCountUpdated);
		Inspector.on("Console.messagesCleared", _onMessagesCleared);
		if (Inspector.connected()) _onConnect();
	}

	function unload() {
		Inspector.off("connect", _onConnect);
		Inspector.off("Console.messageAdded", _onMessageAdded);
		Inspector.off("Console.messageRepeatCountUpdated", _onMessageRepeatCountUpdated);
		Inspector.off("Console.messagesCleared", _onMessagesCleared);
	}

	// public methods
	exports.init = init;
	exports.unload = unload;
});