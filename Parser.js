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
/*global define, brackets, $, esprima */

define(function (require, exports, module) {
	'use strict';

	var NativeFileSystem = brackets.getModule("file/NativeFileSystem").NativeFileSystem,
		FileUtils        = brackets.getModule("file/FileUtils");

	var $script;
	var caches = {};

	/** Event Handlers *******************************************************/

	/** Actions **************************************************************/

	function parse(code, options) {
		return esprima.parse(code, options);
	}

	function walk(tree, handlers) {
		var ignore = {
			id:       true,
			type:     true,
			kind:     true,
			property: true,
			loc:      true,
			range:    true
		};
		
		var queue = [tree];
		var current, type, abstractType, key, value, i;

		while (queue.length) {
			current = queue.shift();
			type    = current.type;
			
			if (type && handlers[type]) {
				handlers[type](current);
			}

			for (key in current) {
				if (ignore[key] || ! current.hasOwnProperty(key)) { continue; }
				value = current[key];
				if ($.isArray(value)) {
					queue = queue.concat(value);
				}
				else if (typeof value === 'object' && value !== null) {
					queue.push(value);
				}
			}
		}
	}

	function getCacheForUrl(url) {
		if (! caches[url]) {
			caches[url] = {};
		}
		return caches[url];
	}

	/** Private Functions *******************************************************/

	/** Helper Functions *******************************************************/

	function loadEsprima() {
		if (typeof esprima !== 'undefined') { return; }
		$script = $("<script>").attr("src", require.toUrl("lib/esprima.js")).appendTo(window.document.head);
	}

	/** Init Functions *******************************************************/
	
	// init
	function init() {
		loadEsprima();
	}

	function unload() {
		if ($script) {
			$script.remove();
		}
	}

	// public methods
	exports.init = init;
	exports.unload = unload;

	exports.parse = parse;
	exports.walk = walk;
	exports.getCacheForUrl = getCacheForUrl;
});
