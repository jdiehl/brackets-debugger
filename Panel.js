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

define(function (require, exports) {
	'use strict';

	var Inspector = brackets.getModule('LiveDevelopment/Inspector/Inspector');
	// For resizing
	var EditorManager = brackets.getModule('editor/EditorManager');

	var $panel, $toolbar, $tabs, $buttons;

	var $exports = $(exports);

	function _onTabClicked(event) {
		var $tab       = $(event.target).closest('li');
		var $activeTab = $tab.siblings().andSelf().filter('.active');

		var id       = $tab.data('id');
		var activeId = $activeTab.data('id');

		if (id === activeId) { return; }

		var $content       = $('#' + id);
		var $activeContent = $('#' + activeId);

		$activeTab.add($activeContent).removeClass('active');
		$tab.add($content).addClass('active');

		if (activeId) { $exports.triggerHandler('tabDeactivated', activeId); }
		$exports.triggerHandler('tabActivated', id);
	}

	function _onCloseClicked() {
		toggle();
	}

	function addTab(id, title, $content) {
		var $tab = $('<li>').text(title).attr('data-id', id);

		$tabs.append($tab);
		$panel.append($content);

		// If it's the first tab added, activate it
		if ($tabs.children().length === 1) { $tab.click(); }

		return $tab;
	}

	function addButton($button) {
		$buttons.append($button);

		return $button;
	}
	
	function _onConnect() {
		toggle(true);
	}

	function _onDisconnect() {
		toggle(false);
	}

	// init
	function init() {
		// create the bottom panel
		$panel = $('<div id="jdiehl-debugger-panel" class="bottom-panel">');
		
		// configure the toolbar
		$toolbar = $('<div class="toolbar simple-toolbar-layout">').appendTo($panel);
		$buttons = $('<div class="toolbar-buttons">').appendTo($toolbar);
		$tabs = $('<ul class="toolbar-tabs">').appendTo($toolbar).on('click', 'li', _onTabClicked);
		$('<a href="#"" class="close">&times;</a>').appendTo($toolbar).on('click', _onCloseClicked);

		// attach the panel to the main view's content
		$('.main-view .content').append($panel);

		$(Inspector).on('connect.debugger', _onConnect);
		$(Inspector).on('disconnect.debugger', _onDisconnect);

		if (Inspector.connected()) {
			_onConnect();
		}
	}

	function unload() {
		$(Inspector).off('.debugger');
		$panel.remove();
		EditorManager.resizeEditor();

		$exports.off();
	}

	// toggle the display of the panel
	function toggle(show) {
		$panel.toggle(show);
		EditorManager.resizeEditor();
		$exports.triggerHandler(show ? 'show' : 'hide');
	}

	// public methods
	exports.init = init;
	exports.unload = unload;
	exports.toggle = toggle;
	exports.addTab = addTab;
	exports.addButton = addButton;
});
