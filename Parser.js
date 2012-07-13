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

	/** Event Handlers *******************************************************/

	/** Actions **************************************************************/

	function parse(code, options) {
		return esprima.parse(code, options);
	}

	function walker() {
		var callbacks = {};
		
		var api = {};

		api.on = function (type, callback) {
			var types = type.split(/\s+/);

			for (var i = 0; i < types.length; i++) {
				type = types[i];
				if (! callbacks[type]) {
					callbacks[type] = [];
				}
				callbacks[type].push(callback);
			}
			
			return api;
		};

		api.walk = function (tree) {
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
				
				if (type && callbacks[type]) {
					for (i = 0; i < callbacks[type].length; i++) {
						callbacks[type][i](current);
					}
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

			return api;
		};

		return api;
	}

	/** Private Functions *******************************************************/

	/** Helper Functions *******************************************************/

	/** If url is local, calls callback with the raw text and returns true, returns false otherwise*/
	function _readLocalUrl(url, callback) {
		if (url.slice(0, 7) !== 'file://') {
			return false;
		}
		
		var path = url.slice(7);
		console.log("Reading " + path);
		var fileEntry = new NativeFileSystem.FileEntry(path);
		FileUtils.readAsText(fileEntry).done(callback);
		
		return true;
	}

	function loadLibs() {
		loadEsprima();
	}

	function loadEsprima() {
		if (typeof esprima === 'undefined') {
			console.log("Loading esprima.js");
			$script = $("<script>").attr("src", require.toUrl("lib/esprima.js")).appendTo(window.document.head);
		} else {
			console.log("Esprima already loaded");
		}
	}

	/** Init Functions *******************************************************/
	
	// init
	function init() {
		loadLibs();
	}

	function unload() {
		$script.remove();
	}

	// public methods
	exports.init = init;
	exports.unload = unload;

	exports.parse = parse;
	exports.walker = walker;
});
