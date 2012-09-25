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

	var Inspector      = brackets.getModule("LiveDevelopment/Inspector/Inspector");
	var EditorManager  = brackets.getModule("editor/EditorManager");
	var CommandManager = brackets.getModule("command/CommandManager");
	var Menus          = brackets.getModule("command/Menus");

	var Debugger = require("Debugger");
	var Panel    = require("Panel");

	var tabId                  = "jdiehl-debugger-console";
	var outputContextMenuId    = "jdiehl-debugger-console-output";
	var outputClearCommandName = "Clear Console";
	var outputClearCommandId   = "jdiehl.debugger.console.clear";

	var $tab, $output, $prompt;
	var $btnPause, $btnContinue, $btnStepOver, $btnStepInto, $btnStepOut;
	var _lastMessage;
	var outputContextMenu;

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

	function _updateButtonsForPauseState(paused) {
		$btnPause.attr("disabled", paused);
		$btnContinue.attr("disabled", !paused);
		$btnStepOver.attr("disabled", !paused);
		$btnStepInto.attr("disabled", !paused);
		$btnStepOut.attr("disabled", !paused);
	}

	function _onOutputContextMenu(event) {
		var menu = Menus.getContextMenu("editor-context-menu");
		outputContextMenu.open(event);
	}

	function _onToolbarButtonPressed(event) {
		event.preventDefault();
		var method = this.getAttribute("class").replace(/\s*/, '');
		if (method === "pause") { this.disabled = true; }
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

	function _onPaused(event, info) {
		if (! info.halt) { return; }
		_updateButtonsForPauseState(true);
	}

	function _onResumed(event, info, stayPaused) {
		if (! info.halt || stayPaused) { return; }
		_updateButtonsForPauseState(false);
	}

	function _onReload(event) {
		// assume we're not paused
		_updateButtonsForPauseState(false);
	}

	function _onConnect(event) {
		Inspector.Console.enable();
	}

	// init
	function init() {
		// Output context menu with entry "Clear Console"
		CommandManager.register(outputClearCommandName, outputClearCommandId, Inspector.Console.clearMessages);
        outputContextMenu = Menus.registerContextMenu(outputContextMenuId);
        outputContextMenu.addMenuItem(outputClearCommandId);

		// configure the tab content
		$tab    = $('<div class="table-container">').attr('id', tabId);
		$output = $('<div class="output">').on("contextmenu", _onOutputContextMenu).appendTo($tab);
		$prompt = $('<input class="prompt">').on("keyup", _onPromptKeypress).appendTo($tab);
		Panel.addTab(tabId, "Console", $tab);
		
		// configure the toolbar
		$btnPause    = Panel.addButton($('<button class="pause" title="Pause">').on("mousedown", _onToolbarButtonPressed));
		$btnContinue = Panel.addButton($('<button class="resume" title="Resume">').on("mousedown", _onToolbarButtonPressed));
		$btnStepOver = Panel.addButton($('<button class="stepOver" title="Step Over">').on("mousedown", _onToolbarButtonPressed));
		$btnStepInto = Panel.addButton($('<button class="stepInto" title="Step Into">').on("mousedown", _onToolbarButtonPressed));
		$btnStepOut  = Panel.addButton($('<button class="stepOut" title="Step Out">').on("mousedown", _onToolbarButtonPressed));

		// register for debugger events
		var $Debugger = $(Debugger);
		$Debugger.on("paused", _onPaused);
		$Debugger.on("resumed", _onResumed);
		$Debugger.on("reload", _onReload);
		
		// configure the inspector
		$(Inspector.Console).on("messageAdded.debugger", _onMessageAdded);
		$(Inspector.Console).on("messageRepeatCountUpdated.debugger", _onMessageRepeatCountUpdated);
		$(Inspector.Console).on("messagesCleared.debugger", _onMessagesCleared);
		$(Inspector).on("connect.debugger", _onConnect);
		if (Inspector.connected()) _onConnect();
	}

	function unload() {
		// unregister debugger events
		var $Debugger = $(Debugger);
		$Debugger.off("paused", _onPaused);
		$Debugger.off("resumed", _onResumed);
		$Debugger.off("reload", _onReload);
		
		$(Inspector).off(".debugger");
		$(Inspector.Console).off(".debugger");
	}

	// public methods
	exports.init = init;
	exports.unload = unload;
});