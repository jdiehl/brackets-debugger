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

	var $panel, $panelToolbar;
	var $consoleContainer, $consoleOut, $consolePrompt;
	var $btnPause, $btnStep, $btnContinue;
	var $tabConsole, $tabTraces;
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

		$consoleOut.append($msg);
		$consoleOut.scrollTop($msg.offset().top);
	}

	// on prompt keypress
	var _history = [];
	var _curHistory;
	function _onPromptKeypress(e) {

		switch (e.keyCode) {
		case 13: // return
			_curHistory = undefined;
			var command = $consolePrompt.val();
			$consolePrompt.val("");
			_add("out", command);
			_history.push(command);
			Debugger.evaluate(command, function (res) {
				_add("in", res.result, res.wasThrown);
			});
			break;

		case 38: // up
			if (_curHistory !== undefined || $consolePrompt.val().length === 0) {
				_curHistory = _curHistory === undefined ? _history.length - 1 : _curHistory - 1;
				if (_curHistory < 0) {
					_curHistory = 0;
				} else {
					$consolePrompt.val(_history[_curHistory]);
				}
			}
			break;

		case 40: // down
			if (_curHistory !== undefined) {
				_curHistory++;
				if (_curHistory > _history.length - 1) {
					_curHistory = _history.length - 1;
				} else {
					$consolePrompt.val(_history[_curHistory]);
				}
			}
			break;

		default:
			_curHistory = undefined;
		}
	}

	function _onTabClicked(event) {
		var $tab = $(event.target).closest('li');
		var $content = $("#" + $tab.attr('data-id'));

		$tab.addClass('active').siblings().removeClass('active');
		$content.addClass('active').siblings('.table-container').removeClass('active');
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

    function _onConnect() {
		Inspector.Console.enable();
		toggle(true);
    }

    function _onDisconnect() {
		toggle(false);
    }

	// init
	function init() {
		// configure the console
		$panel = $('<div id="jdiehl-debugger-panel" class="bottom-panel">');

		// configure the toolbar
		$panelToolbar = $('<div class="toolbar simple-toolbar-layout">');
		$btnPause = $('<button class="pause">').appendTo($panelToolbar).on("click", Debugger.pause);
		$btnContinue = $('<button class="resume">').appendTo($panelToolbar).on("click", Debugger.resume);
		$btnStep = $('<button class="stepOver">').appendTo($panelToolbar).on("click", Debugger.stepOver);
		$btnStep = $('<button class="stepInto">').appendTo($panelToolbar).on("click", Debugger.stepInto);
		$btnStep = $('<button class="stepOut">').appendTo($panelToolbar).on("click", Debugger.stepOut);
		var $tabs = $('<ul class="toolbar-tabs">').appendTo($panelToolbar).on('click', 'li', _onTabClicked);
		$tabConsole = $('<li data-id="jdiehl-debugger-console" class="active">Console</a>').appendTo($tabs);
		$tabTraces  = $('<li data-id="jdiehl-debugger-traces">Traces</a>').appendTo($tabs);
		$panelToolbar.append('<a href="#" class="close">&times;</a>');
		$panel.append($panelToolbar);

		// configure the container
		$consoleContainer = $('<div class="table-container active" id="jdiehl-debugger-console">').appendTo($panel);
		$consoleOut = $('<div class="output">').appendTo($consoleContainer);
		$consolePrompt = $('<input class="prompt">').on("keyup", _onPromptKeypress).appendTo($consoleContainer);

		var $tracesContainer = $('<div class="table-container" id="jdiehl-debugger-traces">').appendTo($panel);
		$tracesContainer.text('test123');

		// attach the console to the main view's content
		$(".main-view .content").append($panel);

		Inspector.on("connect", _onConnect);
		Inspector.on("disconnect", _onDisconnect);
		Inspector.on("Console.messageAdded", _onMessageAdded);
		Inspector.on("Console.messageRepeatCountUpdated", _onMessageRepeatCountUpdated);

		if (Inspector.connected()) _onConnect();
	}

	function unload() {
		Inspector.off("connect", _onConnect);
		Inspector.off("disconnect", _onDisconnect);
		Inspector.off("Console.messageAdded", _onMessageAdded);
		Inspector.off("Console.messageRepeatCountUpdated", _onMessageRepeatCountUpdated);
		$panel.remove();
		EditorManager.resizeEditor();
	}

	// toggle the display of the console
	function toggle(show) {
		$panel.toggle(show);
		EditorManager.resizeEditor();
	}

	// public methods
	exports.init = init;
	exports.unload = unload;
	exports.toggle = toggle;
});
