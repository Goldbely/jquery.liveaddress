/**
	LiveAddress International API jQuery Plugin
	by SmartyStreets - smartystreets.com

	(c) 2016 SmartyStreets

	LICENSED UNDER THE GNU GENERAL PUBLIC LICENSE VERSION 3
	(http://opensource.org/licenses/gpl-3.0.html)

	Documentation: 			http://smartystreets.com/kb/liveaddress-api/website-forms
	Version: 				(See variable below for version)
	Minified:				(See documentation or GitHub repository for minified script file)
	Latest stable version: 	(See documentation)
	Bleeding-edge release: 	https://github.com/smartystreets/jquery.liveaddress

	Feel free to contribute to this project on GitHub by
	submitting pull requests and reporting issues.
**/


(function($, window, document) {
	"use strict"; //  http://ejohn.org/blog/ecmascript-5-strict-mode-json-and-more/

	/*
	 *	PRIVATE MEMBERS
	 */

	var instance; // Contains public-facing functions and variables
	var ui = new UI; // Internal use only, for UI-related tasks
	var version = "1.0.0"; // Version of this copy of the script

	var defaults = {
		candidates: 3, // Number of suggestions to show if ambiguous
		requestUrl: "https://international-street.api.smartystreets.com/verify", // API endpoint
		timeout: 5000, // How long to wait before the request times out (5000 = 5 seconds)
		speed: "medium", // Animation speed
		ambiguousMessage: "Choose the correct address", // Message when address is ambiguous
		invalidMessage: "Address not verified", // Message when address is invalid
		certifyMessage: "Click here to certify the address is correct",
		fieldSelector: "input[type=text], input:not([type]), textarea, select", // Selector for possible address-related form elements
		submitSelector: "[type=submit], [type=image], [type=button]:last, button:last" // Selector to find a likely submit button or submit image (in a form)
	};
	var config = {}; // Configuration settings as set by the user or just the defaults
	var forms = []; // List of forms (which hold lists of addresses)
	var defaultSelector = 'body'; // Default selector which should be over the whole page (must be compatible with the .find() function; not document)
	var mappedAddressCount = 0; // The number of currently-mapped addresses
	var acceptableFields = [
		"freeform", "address1", "address2", "address3", "address4", "organization", "locality", "administrative_area", "postal_code", "country"
	]; // API input field names

	/*
	 *	ENTRY POINT
	 */

	$.LiveAddress = function(arg) {
		return $(defaultSelector).LiveAddress(arg);
	};

	$.fn.LiveAddress = function(arg) {
		var matched = this,
			wasChained = matched.prevObject ? !!matched.prevObject.prevObject : false;

		// Make sure the jQuery version is compatible
		var vers = $.fn.jquery.split(".");
		if (vers.length >= 2) {
			if (vers[0] < 1 || (vers[0] == 1 && vers[1] < 5)) {
				console.log("jQuery version " + $.fn.jquery + " found, but LiveAddress requires jQuery version 1.5 or higher. Aborting.");
				return false;
			}
		} else
			return false;

		if (arg.debug)
			console.log("LiveAddress API jQuery Plugin version " + version + " (Debug mode)");

		// Mapping fields requires that the document be fully loaded in order to attach UI elements
		if (document.readyState === "complete")
			window.loaded = true;
		else
			$(window).load(function() {
				window.loaded = true;
			});

		// Determine if user passed in an API key or a settings/config object
		if (typeof arg === 'string') {
			// Use the default configuration
			config = {
				key: arg
			};
		} else if (typeof arg === 'object') {
			// Use the user's configuration on top of the default
			config = arg;
		}

		// Enforce some defaults
		config.candidates = config.candidates || defaults.candidates;
		config.ui = typeof config.ui === 'undefined' ? true : config.ui;
		config.autoVerify = config.autoVerify !== true && config.autoVerify !== false ? true : config.autoVerify;
		config.submitVerify = typeof config.submitVerify === 'undefined' ? true : config.submitVerify;
		config.timeout = config.timeout || defaults.timeout;
		config.ambiguousMessage = config.ambiguousMessage || defaults.ambiguousMessage;
		config.invalidMessage = config.invalidMessage || defaults.invalidMessage;
		config.certifyMessage = config.certifyMessage || defaults.certifyMessage;
		config.fieldSelector = config.fieldSelector || defaults.fieldSelector;
		config.submitSelector = config.submitSelector || defaults.submitSelector;
		config.requestUrl = config.requestUrl || defaults.requestUrl;
		config.geocode = typeof config.geocode === 'undefined' ? false : config.geolocate;
		config.enforceVerification = typeof config.enforceVerification === 'undefined' ? false : config.enforceVerification;

		config.candidates = config.candidates < 1 ? 0 : (config.candidates > 10 ? 10 : config.candidates);

		// Parameter used for internal uses. If set to true, freeform will fail. Use with caution

		/*
		 *	EXPOSED (PUBLIC) FUNCTIONS
		 */
		instance = {
			events: EventHandlers,
			on: function(eventType, userHandler) {
				if (!EventHandlers[eventType] || typeof userHandler !== 'function')
					return false;

				var previousHandler = EventHandlers[eventType];
				EventHandlers[eventType] = function(event, data) {
					userHandler(event, data, previousHandler);
				};
			},
			mapFields: function(map) {
				var doMap = function(map) {

					if (typeof map === 'object')
						return ui.mapFields(map, matched);
					else if (!map && typeof config.addresses === 'object')
						return ui.mapFields(config.addresses, matched);
					else
						return false;
				};
				if ($.isReady)
					doMap(map);
				else
					$(function() {
						if (!wasChained)
							matched = $(matched.selector);
						doMap(map);
					});
			},
			makeAddress: function(addressData) {
				if (typeof addressData !== "object")
					return instance.getMappedAddressByID(addressData) || new Address({
						street: addressData
					});
				else
					return new Address(addressData);
			},
			verify: function(input, callback) {
				var addr = instance.makeAddress(input); // Below means, force re-verify even if accepted/unchanged.
				trigger("VerificationInvoked", {
					address: addr,
					verifyAccepted: true,
					invoke: callback
				});
			},
			getMappedAddresses: function() {
				var addr = [];
				for (var i = 0; i < forms.length; i++)
					for (var j = 0; j < forms[i].addresses.length; j++)
						addr.push(forms[i].addresses[j]);
				return addr;
			},
			getMappedAddressByID: function(addressID) {
				for (var i = 0; i < forms.length; i++)
					for (var j = 0; j < forms[i].addresses.length; j++)
						if (forms[i].addresses[j].id() == addressID)
							return forms[i].addresses[j];
			},
			setKey: function(htmlkey) {
				config.key = htmlkey;
			},
			activate: function(addressID) {
				var addr = instance.getMappedAddressByID(addressID);
				if (addr) {
					addr.active = true;
					ui.showSmartyUI(addressID);
				}
			},
			deactivate: function(addressID) {
				if (!addressID)
					return ui.clean();
				var addr = instance.getMappedAddressByID(addressID);
				if (addr) {
					addr.active = false;
					ui.hideSmartyUI(addressID);
				}
			},
			autoVerify: function(setting) {
				if (typeof setting === 'undefined')
					return config.autoVerify;
				else if (setting === false)
					config.autoVerify = false;
				else if (setting === true)
					config.autoVerify = true;
				for(var i = 0; i < forms.length; i++) {
					for(var j = 0; j < forms[i].addresses.length; j++) {
						forms[i].addresses[j].verifyCount = 0;
					}
				}
			},
			version: version
		};


		// Unbind old handlers then bind each handler to an event
		for (var prop in EventHandlers) {
			$(document).unbind(prop, HandleEvent);
			bind(prop);
		}

		// Map the fields
		instance.mapFields();

		return instance;
	};



	/*
	 *	PRIVATE FUNCTIONS / OBJECTS
	 */



	/*
		The UI object auto-maps the fields and controls
		interaction with the user during the address
		verification process.
	*/
	function UI() {
		var submitHandler; // Function which is later bound to handle form submits
		var formDataProperty = "smarty-form"; // Indicates whether we've stored the form already

		var loaderWidth = 24,
			loaderHeight = 8; // TODO: Update these if the image changes
		var uiCss = "<style>" + ".smarty-dots { display: none; position: absolute; z-index: 999; width: " +
			loaderWidth + "px; height: " + loaderHeight + "px; " +
			"background-image: url('data:image/gif;base64,R0lGODlhGAAIAOMAALSytOTi5MTCxPTy9Ly6vPz6/Ozq7MzKzLS2tOTm5PT29Ly+v" +
			"Pz+/MzOzP///wAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQJBgAOACwAAAAAGAAIAAAEUtA5NZi8jNrr2FBScQAAYVyKQC6gZBDkUTRkXUhLDSw" +
			"hojc+XcAx0JEGjoRxCRgWjcjAkqZr5WoIiSJIaohIiATqimglg4KWwrDBDNiczgDpiAAAIfkECQYAFwAsAAAAABgACACEVFZUtLK05OLkxMbE9" +
			"PL0jI6MvL68bG5s7Ors1NbU/Pr8ZGJkvLq8zM7MXFpctLa05ObkzMrM9Pb0nJqcxMLE7O7s/P78////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
			"ABWDgZVWQcp2nJREWmhLSKRWOcySoRAWBEZ8IBi+imAAcxwXhZODxDCfFwxloLI6A7OBCoPKWEG/giqxRuOLKRSA2lpVM6kM2dTZmyBuK0Aw8f" +
			"hcQdQMxIwImLiMSLYkVPyEAIfkECQYAFwAsAAAAABgACACEBAIEpKak1NbU7O7svL68VFZU/Pr8JCIktLK05OLkzMrMDA4M9Pb0vLq87Ors9PL" +
			"0xMLEZGZk/P78tLa05ObkzM7MFBIU////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABWLgJVGCcZ2n9DASmq7nUwDAQaAPhCAEgzqNncIQodEWg" +
			"xNht7tdDBMmorIw0gKXh3T3uCSYgV3VitUiwrskZTspGpFKsJMRRVdkNBuKseT5Tg4TUQo+BgkCfygSDCwuIgN/IQAh+QQJBgAXACwAAAAAGAA" +
			"IAIRUVlS0srTk4uR8enz08vTExsRsbmzs6uyMjoz8+vzU1tRkYmS8urzMzsxcWly0trTk5uR8fnz09vTMyszs7uycmpz8/vz///8AAAAAAAAAA" +
			"AAAAAAAAAAAAAAAAAAAAAAFYOBlUVBynad1QBaaEtIpIY5jKOgxAM5w5IxAYJKo8HgLwmnnAAAGsodQ2FgcnYUL5Nh0QLTTqbXryB6cXcBPEBY" +
			"aybEL0wm9SNqFWfOWY0Z+JxBSAXkiFAImLiolLoZxIQAh+QQJBgAQACwAAAAAGAAIAIQEAgS0srTc2tz08vTMyszk5uT8+vw0MjS8ury0trTk4" +
			"uT09vTMzszs6uz8/vw0NjT///8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFWiAELYMjno4gmCfkDItoEEG" +
			"ANKfwAMAjnA1EjWBg1I4G14HHO5gMiWOAEZUqIAIm86eQeo/XrBbA/RqlMceS6RxVa4xZLVHI7QCHn6hQRbAWDSwoKoIiLzEQIQAh+QQJBgAXA" +
			"CwAAAAAGAAIAIRUVlS0srTk4uR8enz08vTExsRsbmzs6uyMjoz8+vzU1tRkYmS8urzMzsxcWly0trTk5uR8fnz09vTMyszs7uycmpz8/vz///8" +
			"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFY+B1SYQlntYBmeeVQJSZTEHAHCcUOUCEiwqDw4GQNGrIhGgA4DkGIsIC0ARUHsia4AKpOiGXghewy" +
			"Gq5YwCu4Gw6jlnJ0gu9SKvWRKH2AIt0TQN+F0FNRSISMS0XKSuLCQKKIQAh+QQJBgAXACwAAAAAGAAIAIQEAgSkpqTU1tTs7uy8vrxUVlT8+vw" +
			"kIiS0srTk4uTMyswMDgz09vS8urzs6uz08vTEwsRkZmT8/vy0trTk5uTMzswUEhT///8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFZOB1MY8kn" +
			"hJpnpchUKahIEjjnAxEE8xJHABA4VGhGQ0ighFBEA0swWBkYgxMEpfHkva4BKLBxRaBHdACCHT3C14U0VbkRWlsXgYLcERGJQxOD3Q8PkBCfyM" +
			"DKygMDIoiDAIJJiEAIfkECQYAFwAsAAAAABgACACEVFZUtLK05OLkxMbE9PL0jI6MvL68bG5s7Ors1NbU/Pr8ZGJkvLq8zM7MXFpctLa05Obkz" +
			"MrM9Pb0nJqcxMLE7O7s/P78////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABWPgdUmEJZ4WaZ6XAlWmEgUBg5wSRRvSmRwOR0HSoBkVIoMxYBA" +
			"RFgBHdPJYBgSXijVAuAykUsBii5VsK96oelFc9i5K40MkgYInigHtAcHFH28XP1EFXSMwLBcWFRIrJwoCiCEAOw=='); }" +
			".smarty-ui { position: absolute; z-index: 99999; text-shadow: none; text-align: left; text-decoration: none; }" +
			".smarty-popup { border: 3px solid #4C4C4C; padding: 0; background: #F6F6F6; " +
			"box-shadow: 0px 10px 35px rgba(0, 0, 0, .8); }" + ".smarty-popup-header { background: #DDD; height: 12px; " +
			"text-transform: uppercase; font: bold 12px/1em 'Arial Black', sans-serif; padding: 12px; }" +
			".smarty-popup-ambiguous-header { color: #333; }" + ".smarty-popup-invalid-header { color: #CC0000; }" +
			".smarty-popup-close { color: #CC0000 !important; text-decoration: none !important; position: absolute; " +
			"right: 15px; top: 10px; display: block; padding: 4px 6px; text-transform: uppercase; }" +
			".smarty-popup-close:hover { color: #FFF !important; background: #CC0000; }" +
			".smarty-choice-list .smarty-choice { background: #FFF; padding: 10px 15px; color: #1A1A1A; }" +
			".smarty-choice { display: block; font: 300 14px/1.5em sans-serif; text-decoration: none !important; " +
			"border-top: 1px solid #CCC; }" + ".smarty-choice-list .smarty-choice:hover { color: #EEE !important; " +
			"background: #333; text-decoration: none !important; }" + ".smarty-choice-alt { border-top: 1px solid #4C4C4C; " +
			"background: #F6F6F6 !important; box-shadow: inset 0 4px 15px -5px rgba(0, 0, 0, .45); }" + ".smarty-choice-alt" +
			" .smarty-choice-abort, .smarty-choice-override { padding: 6px 15px; color: #B3B3B3 !important; " +
			"font-size: 12px; text-decoration: none !important; }" + ".smarty-choice-alt " +
			".smarty-choice:first-child { border-top: 0; }" + ".smarty-choice-abort:hover { color: #333 !important; }" +
			".smarty-choice-override:hover { color: #CC0000 !important; }" + ".smarty-tag { position: absolute; " +
			"display: block; overflow: hidden; font: 15px/1.2em sans-serif; text-decoration: none !important; width: 20px; " +
			"height: 18px; border-radius: 25px; transition: all .25s; -moz-transition: all .25s; " +
			"-webkit-transition: all .25s; -o-transition: all .25s; }" + ".smarty-tag:hover { width: 70px; " +
			"text-decoration: none !important; color: #999; }" + ".smarty-tag:hover .smarty-tag-text " +
			"{ color: #000 !important; }" + ".smarty-tag-grayed { border: 1px solid #B4B4B4 !important; " +
			"color: #999 !important; background: #DDD !important; box-shadow: inset 0 9px 15px #FFF; }" +
			".smarty-tag-green { border: 1px solid #407513 !important; color: #407513 !important; " +
			"background: #A6D187 !important; box-shadow: inset 0 9px 15px #E3F6D5; }" + ".smarty-tag-grayed:hover " +
			"{ border-color: #333 !important; }" + ".smarty-tag-check { padding-left: 4px; " +
			"text-decoration: none !important; }" + ".smarty-tag-text { font-size: 12px !important; position: absolute; " +
			"top: 0; left: 16px; width: 50px !important; text-align: center !important; }" + "</style>";


		this.postMappingOperations = function() {
			// Injects materials into the DOM, binds to form submit events, etc... very important.

			if (config.ui) {
				// Prepend CSS to head tag to allow cascading and give their style rules priority
				$('head').prepend(uiCss);

				// For each address on the page, inject the loader and "address verified" markup after the last element
				var addresses = instance.getMappedAddresses();
				for (var i = 0; i < addresses.length; i++) {
					var id = addresses[i].id();
					$('body').append('<div class="smarty-ui"><div title="Loading..." class="smarty-dots smarty-addr-' + id + '"></div></div>');
					var offset = uiTagOffset(addresses[i].corners(true));
					$('body').append('<div class="smarty-ui" style="top: ' + offset.top + 'px; left: ' + offset.left +
						'px;"><a href="javascript:" class="smarty-tag smarty-tag-grayed smarty-addr-' + id +
						'" title="Address not verified. Click to verify." data-addressid="' + id +
						'"><span class="smarty-tag-check">&#10003;</span><span class="smarty-tag-text">Verify</span></a></div>');

					// Move the UI elements around when browser window is resized
					$(window).resize({
						addr: addresses[i]
					}, function(e) {
						var addr = e.data.addr;
						var offset = uiTagOffset(addr.corners(true)); // Position of lil' tag
						$('.smarty-tag.smarty-addr-' + addr.id())
							.parent('.smarty-ui')
							.css('top', offset.top + 'px')
							.css('left', offset.left + 'px');

						var addrOffset = addr.corners(); // Position of any popup windows
						$('.smarty-popup.smarty-addr-' + addr.id())
							.parent('.smarty-ui')
							.css('top', addrOffset.top + 'px')
							.css('left', addrOffset.left + 'px');
					});

				}

				$('body').delegate('.smarty-tag-grayed', 'click', function(e) {
					// "Verify" clicked -- manually invoke verification
					var addrId = $(this).data('addressid');
					instance.verify(addrId);
				});

				$('body').delegate('.smarty-undo', 'click', function(e) {
					// "Undo" clicked -- replace field values with previous input
					var addrId = $(this).parent().data('addressid');
					var addr = instance.getMappedAddressByID(addrId);
					addr.undo(true);
					// If fields are re-mapped after an address was verified, it loses its "accepted" status even if no values were changed.
					// Thus, in some rare occasions, the undo link and the "verified!" text may not disappear when the user clicks "Undo",
					// The undo functionality still works in those cases, but with no visible changes, the address doesn't fire "AddressChanged"...
				});

			}

			if (config.submitVerify) {
				// Bind to form submits through form submit and submit button click events
				for (var i = 0; i < forms.length; i++) {
					var f = forms[i];

					submitHandler = function(e) {
						// Don't invoke verification if it's already processing
						if (e.data.form && e.data.form.processing)
							return suppress(e);

						/*
							IMPORTANT!
							Prior to version 2.4.8, the plugin would call syncWithDom() at submit-time
							in case programmatic changes were made to the address input fields, including
							browser auto-fills. The sync function would detect those changes and force
							a re-verification to not let invalid addresses through. Unfortunately, this
							frequently caused infinite loops (runaway lookups), ultimately preventing
							form submission, which is unacceptable. As a safety measure to protect our
							customer's subscriptions, we've removed syncWithDom(). The website owner is
							responsible for making sure that any changes to address field values raise the
							"change" event on that element. Example: $('#city').val('New City').change();
						*/

						if (!e.data.form.allActiveAddressesAccepted()) {
							// We could verify all the addresses at once, but that can overwhelm the user.
							// An API request is usually quick, so let's do one at a time: it's much cleaner.
							var unaccepted = e.data.form.activeAddressesNotAccepted();
							if (unaccepted.length > 0)
								trigger("VerificationInvoked", {
									address: unaccepted[0],
									invoke: e.data.invoke,
									invokeFn: e.data.invokeFn
								});
							return suppress(e);
						}
					};

					// Performs the tricky operation of uprooting existing event handlers that we have references to
					// (either by jQuery's data cache or HTML attributes) planting ours, then laying theirs on top
					var bindSubmitHandler = function(domElement, eventName) {
						if (!domElement || !eventName)
							return;

						var oldHandlers = [],
							eventsRef = $._data(domElement, 'events');

						// If there are previously-bound-event-handlers (from jQuery), get those.
						if (eventsRef && eventsRef[eventName] && eventsRef[eventName].length > 0) {
							// Get a reference to the old handlers previously bound by jQuery
							oldHandlers = $.extend(true, [], eventsRef[eventName]);
						}

						// Unbind them...
						$(domElement).unbind(eventName);

						// ... then bind ours first ...
						$(domElement)[eventName]({
							form: f,
							invoke: domElement,
							invokeFn: eventName
						}, submitHandler);

						// ... then bind theirs last:
						// First bind their onclick="..." or onsubmit="..." handles...
						if (typeof domElement['on' + eventName] === 'function') {
							var temp = domElement['on' + eventName];
							domElement['on' + eventName] = null;
							$(domElement)[eventName](temp);
						}

						// ... then finish up with their old jQuery handles.
						for (var j = 0; j < oldHandlers.length; j++)
							$(domElement)[eventName](oldHandlers[j].data, oldHandlers[j].handler);
					};

					// Take any existing handlers (bound via jQuery) and re-bind them for AFTER our handler(s).
					var formSubmitElements = $(config.submitSelector, f.dom);

					// Highlight the submit button
					if (config.debug) {
						for (var j = 0; j < formSubmitElements.length; j++) {
							formSubmitElements[j].style.color = '#4BA341';
						}
					}

					// Form submit() events are apparently invoked by CLICKING the submit button (even jQuery does this at its core for binding)
					// (but jQuery, when raising a form submit event with .submit() will NOT necessarily click the submit button)
					formSubmitElements.each(function(idx) {
						bindSubmitHandler(this, 'click'); // These get fired first
					});

				}
			}

			trigger("MapInitialized");
		};

		// Computes where the little checkmark tag of the UI goes, relative to the boundaries of the last field
		function uiTagOffset(corners) {
			return {
				top: corners.top + corners.height / 2 - 10,
				left: corners.right - 6
			};
		}

		// This function is used to find and properly map elements to their field type
		function filterDomElement(domElement, names, labels) {
			/*
				Where we look to find a match, in this order:
			 	name, id, <label> tags, placeholder, title
			 	Our searches first conduct fairly liberal "contains" searches:
			 	if the attribute even contains the name or label, we map it.
			 	The names and labels we choose to find are very particular.
			 */

			var name = lowercase(domElement.name);
			var id = lowercase(domElement.id);
			var selectorSafeID = id.replace(/[\[|\]|\(|\)|\:|\'|\"|\=|\||\#|\.|\!|\||\@|\^|\&|\*]/g, '\\\\$&');
			var placeholder = lowercase(domElement.placeholder);
			var title = lowercase(domElement.title);

			// First look through name and id attributes of the element, the most common
			for (var i = 0; i < names.length; i++)
				if (name.indexOf(names[i]) > -1 || id.indexOf(names[i]) > -1)
					return true;

				// If we can't find it in name or id, look at labels associated to the element.
				// Webkit automatically associates labels with form elements for us. But for other
				// browsers, we have to find them manually, which this next block does.
			if (!('labels' in domElement)) {
				var lbl = $('label[for="' + selectorSafeID + '"]')[0] || $(domElement).parents('label')[0];
				domElement.labels = !lbl ? [] : [lbl];
			}

			// Iterate through the <label> tags now to search for a match.
			for (var i = 0; i < domElement.labels.length; i++) {
				// This inner loop compares each label value with what we're looking for
				for (var j = 0; j < labels.length; j++)
					if ($(domElement.labels[i]).text().toLowerCase().indexOf(labels[j]) > -1)
						return true;
			}

			// Still not found? Then look in "placeholder" or "title"...
			for (var i = 0; i < labels.length; i++)
				if (placeholder.indexOf(labels[i]) > -1 || title.indexOf(labels[i]) > -1)
					return true;

				// Got all the way to here? Probably not a match then.
			return false;
		}

		// User aborted the verification process (X click or esc keyup)
		function userAborted(uiPopup, e) {
			// Even though there may be more than one bound, and this disables the others,
			// this is for simplicity: and I figure, it won't happen too often.
			// (Otherwise "Completed" events are raised by pressing Esc even if nothing is happening)
			$(document).unbind('keyup');
			$(uiPopup).slideUp(defaults.speed, function() {
				$(this).parent('.smarty-ui').remove();
			});
			trigger("Completed", e.data);
		}

		// When we're done with a "pop-up" where the user chooses what to do,
		// we need to remove all other events bound on that whole "pop-up"
		// so that it doesn't interfere with any future "pop-ups".
		function undelegateAllClicks(selectors) {
			if (Array.isArray(selectors) || typeof selectors == "object") {
				for (var selector in selectors) {
					$('body').undelegate(selectors[selector], 'click');
				}
			} else if (typeof selectors === "string") {
				$('body').undelegate(selectors, 'click');
			} else {
				alert("ERROR: Not an array, string, or object passed in to undelegate all clicks");
			}
		}

		// Utility function
		function moveCursorToEnd(el) { // Courtesy of http://css-tricks.com/snippets/javascript/move-cursor-to-end-of-input/
			if (typeof el.selectionStart == "number")
				el.selectionStart = el.selectionEnd = el.value.length;
			else if (typeof el.createTextRange != "undefined") {
				el.focus();
				var range = el.createTextRange();
				range.collapse(false);
				range.select();
			}
		}

		//shows the SmartyUI when activating 1 address
		this.showSmartyUI = function(addressID) {
			var smartyui = $('.deactivated.smarty-addr-' + addressID);
			smartyui.push(smartyui[0].parentElement);
			smartyui.removeClass("deactivated");
			smartyui.addClass("activated");
			smartyui.show();
		};

		//hides the SmartyUI when deactivating 1 address
		this.hideSmartyUI = function(addressID) {
			var smartyui = $('.smarty-addr-' + addressID + ':visible');
			smartyui.addClass("deactivated");
			smartyui.parent().addClass("deactivated");
			smartyui.hide();
			smartyui.parent().hide();
		};

		// If anything was previously mapped, this resets it all for a new mapping.
		this.clean = function() {
			if (forms.length == 0)
				return;

			if (config.debug)
				console.log("Cleaning up old form map data and bindings...");

			// Spare none alive!

			for (var i = 0; i < forms.length; i++) {
				$(forms[i].dom).data(formDataProperty, '');

				// Clean up each form's DOM by resetting the address fields to the way they were
				for (var j = 0; j < forms[i].addresses.length; j++) {
					var doms = forms[i].addresses[j].getDomFields();
					for (var prop in doms) {
						if (config.debug) {
							$(doms[prop]).css('background', 'none').attr('placeholder', '');
							var submitButtons = $(config.submitSelector);
							for (var k = 0; k < submitButtons.length; k++) {
								submitButtons[k].style.color = 'black';
							}
						}
						$(doms[prop]).unbind('change');
					}
				}

				// Unbind our form submit and submit-button click handlers
				$.each(forms, function(idx) {
					$(this.dom).unbind('submit', submitHandler);
				});
				$(config.submitSelector, forms[i].dom).each(function(idx) {
					$(this).unbind('click', submitHandler);
				});
			}

			$('.smarty-ui').undelegate('.smarty-suggestion', 'click').undelegate('.smarty-suggestion', 'mouseover').undelegate('.smarty-suggestion', 'mouseleave').remove();
			$('body').undelegate('.smarty-undo', 'click');
			$('body').undelegate('.smarty-tag-grayed', 'click');
			$(window).unbind('resize');
			$(document).unbind('keyup');

			forms = [];
			mappedAddressCount = 0;

			if (config.debug)
				console.log("Done cleaning up; ready for new mapping.");
		};


		// ** MANUAL MAPPING ** //
		this.mapFields = function(map, context) {
			// "map" should be an array of objects mapping field types
			// to a field by selector, all supplied by the user.
			// "context" should be the set of elements in which fields will be mapped
			// Context can be acquired like: $('#something').not('#something-else').LiveAddress( ... ); ...

			if (config.debug)
				console.log("Manually mapping fields given this data:", map);

			this.clean();
			var formsFound = [];
			map = map instanceof Array ? map : [map];

			for (var addrIdx in map) {
				var address = map[addrIdx];

				if (!address.country)
					continue;

				// Convert selectors into actual DOM references
				for (var fieldType in address) {
					if (fieldType != "id") {
						if (!arrayContains(acceptableFields, fieldType)) { // Make sure the field name is allowed
							if (config.debug)
								console.log("NOTICE: Field named " + fieldType + " is not allowed. Skipping...");
							delete address[fieldType];
							continue;
						}
						var matched = $(address[fieldType], context);
						if (matched.length == 0) { // Don't try to map an element that couldn't be matched or found at all
							if (config.debug)
								console.log("NOTICE: No matches found for selector " + address[fieldType] + ". Skipping...");
							delete address[fieldType];
						} else if (matched.parents('form').length == 0) { // We should only map elements inside a <form> tag; otherwise we can't bind to submit handlers later
							if (config.debug)
								console.log("NOTICE: Element with selector \"" + address[fieldType] + "\" is not inside a <form> tag. Skipping...");
							delete address[fieldType];
						} else
							address[fieldType] = matched[0];
					}
				}

				if (!((address.country && address.freeform) || (address.address1 && address.postal_code) || (address.address1 && address.locality && address.administrative_area))) {
					if (config.debug)
						console.log("NOTICE: Address map (index " + addrIdx + ") was not mapped to a complete street address. Skipping...");
					continue;
				}

				// Acquire the form based on the country address field (the required field)
				var formDom = $(address.country).parents('form')[0];
				var form = new Form(formDom);

				// Persist a reference to the form if it wasn't acquired before
				if (!$(formDom).data(formDataProperty)) {
					// Mark the form as mapped then add it to our list
					$(formDom).data(formDataProperty, 1);
					formsFound.push(form);
				} else {
					// Find the form in our list since we already put it there
					for (var i = 0; i < formsFound.length; i++) {
						if (formsFound[i].dom == formDom) {
							form = formsFound[i];
							break;
						}
					}
				}

				// Add this address to the form
				mappedAddressCount++;
				form.addresses.push(new Address(address, form, address.id));

				if (config.debug)
					console.log("Finished mapping address with ID: " + form.addresses[form.addresses.length - 1].id());
			}

			forms = formsFound;
			trigger("FieldsMapped");
		};


		this.disableFields = function(address) {
			// Given an address, disables the input fields for the address, also the submit button
			if (!config.ui)
				return;

			var fields = address.getDomFields();
			for (var field in fields)
				$(fields[field]).prop ? $(fields[field]).prop('disabled', true) : $(fields[field]).attr('disabled', 'disabled');

			// Disable submit buttons
			if (address.form && address.form.dom) {
				var buttons = $(config.submitSelector, address.form.dom);
				buttons.prop ? buttons.prop('disabled', true) : buttons.attr('disabled', 'disabled');
			}
		};

		this.enableFields = function(address) {
			// Given an address, re-enables the input fields for the address
			if (!config.ui)
				return;

			var fields = address.getDomFields();
			for (var field in fields)
				$(fields[field]).prop ? $(fields[field]).prop('disabled', false) : $(fields[field]).removeAttr('disabled');

			// Enable submit buttons
			if (address.form && address.form.dom) {
				var buttons = $(config.submitSelector, address.form.dom);
				buttons.prop ? buttons.prop('disabled', false) : buttons.removeAttr('disabled');
			}
		};

		this.showLoader = function(addr) {
			if (!config.ui || !addr.hasDomFields())
				return;

			// Get position information now instead of earlier in case elements shifted since page load
			var lastFieldCorners = addr.corners(true);
			var loaderUI = $('.smarty-dots.smarty-addr-' + addr.id()).parent();

			loaderUI.css("top", (lastFieldCorners.top + lastFieldCorners.height / 2 - loaderHeight / 2) + "px")
				.css("left", (lastFieldCorners.right - loaderWidth - 10) + "px");
			$('.smarty-dots', loaderUI).show();
		};

		this.hideLoader = function(addr) {
			if (config.ui)
				$('.smarty-dots.smarty-addr-' + addr.id()).hide();
		};

		this.markAsValid = function(addr) {
			if (!config.ui || !addr)
				return;

			var domTag = $('.smarty-tag.smarty-tag-grayed.smarty-addr-' + addr.id());
			domTag.removeClass('smarty-tag-grayed').addClass('smarty-tag-green').attr("title", "Address verified! Click to undo.");
			$('.smarty-tag-text', domTag).text('Verified').hover(function() {
				$(this).text('Undo');
			}, function() {
				$(this).text('Verified');
			}).addClass('smarty-undo');
		};

		this.unmarkAsValid = function(addr) {
			var validSelector = '.smarty-tag.smarty-addr-' + addr.id();
			if (!config.ui || !addr || $(validSelector).length == 0)
				return;

			var domTag = $('.smarty-tag.smarty-tag-green.smarty-addr-' + addr.id());
			domTag.removeClass('smarty-tag-green').addClass('smarty-tag-grayed').attr("title", "Address not verified. Click to verify.");
			$('.smarty-tag-text', domTag).text('Verify').unbind('mouseenter mouseleave').removeClass('smarty-undo');
		};

		this.showAmbiguous = function(data) {
			if (!config.ui || !data.address.hasDomFields())
				return;

			var addr = data.address;
			var response = data.response;
			var corners = addr.corners();
			corners.width = Math.max(corners.width, 300); // minimum width
			corners.height = Math.max(corners.height, response.length * 63 + 119); // minimum height
			if(config.enforceVerification) {
				corners.height -= 49;
			}

			var html = '<div class="smarty-ui" style="top: ' + corners.top + 'px; left: ' + corners.left + 'px; width: ' +
				corners.width + 'px; height: ' + corners.height + 'px;">' + '<div class="smarty-popup smarty-addr-' +
				addr.id() + '" style="width: ' + (corners.width - 6) + 'px; height: ' + (corners.height - 3) + 'px;">' +
				'<div class="smarty-popup-header smarty-popup-ambiguous-header">' + config.ambiguousMessage +
				'<a href="javascript:" class="smarty-popup-close smarty-abort" title="Cancel">x</a></div>' +
				'<div class="smarty-choice-list">';

			for (var i = 0; i < response.raw.length; i++) {
				var ambigAddr = '';
				if(response.raw[i].address1) {
					ambigAddr += response.raw[i].address1;
				}
				if(response.raw[i].address2) {
					ambigAddr = ambigAddr + '<br>' + response.raw[i].address2;
				}
				if(response.raw[i].address3) {
					ambigAddr = ambigAddr + '<br>' + response.raw[i].address3;
				}
				if(response.raw[i].address4) {
					ambigAddr = ambigAddr + '<br>' + response.raw[i].address4;
				}
				if(response.raw[i].address5) {
					ambigAddr = ambigAddr + '<br>' + response.raw[i].address5;
				}
				if(response.raw[i].address6) {
					ambigAddr = ambigAddr + '<br>' + response.raw[i].address6;
				}
				html += '<a href="javascript:" class="smarty-choice" data-index="' + i + '">' + ambigAddr + '</a>';
			}

			html += '</div><div class="smarty-choice-alt">';
			html += '<a href="javascript:" class="smarty-choice smarty-choice-abort smarty-abort">Click here to change your address</a>';
			if(!config.enforceVerification) {
				html += '<a href="javascript:" class="smarty-choice smarty-choice-override">' + config.certifyMessage + '<br>(' +
					addr.toString() + ')</a>';
			}
			html += '</div></div></div>';
			$(html).hide().appendTo('body').show(defaults.speed);

			// Scroll to it if needed
			if ($(document).scrollTop() > corners.top - 100 || $(document).scrollTop() < corners.top - $(window).height() + 100) {
				$('html, body').stop().animate({
					scrollTop: $('.smarty-popup.smarty-addr-' + addr.id()).offset().top - 100
				}, 500);
			}

			data.selectors = {
				goodAddr: '.smarty-popup.smarty-addr-' + addr.id() + ' .smarty-choice-list .smarty-choice',
				useOriginal: '.smarty-popup.smarty-addr-' + addr.id() + ' .smarty-choice-override',
				abort: '.smarty-popup.smarty-addr-' + addr.id() + ' .smarty-abort'
			};

			// User chose a candidate address
			$('body').delegate(data.selectors.goodAddr, 'click', data, function(e) {
				$('.smarty-popup.smarty-addr-' + addr.id()).slideUp(defaults.speed, function() {
					$(this).parent('.smarty-ui').remove();
					$(this).remove();
				});

				undelegateAllClicks(e.data.selectors);
				delete e.data.selectors;

				trigger("UsedSuggestedAddress", {
					address: e.data.address,
					response: e.data.response,
					invoke: e.data.invoke,
					invokeFn: e.data.invokeFn,
					chosenCandidate: response.raw[$(this).data('index')]
				});
			});

			// User wants to revert to what they typed (forced accept)
			$('body').delegate(data.selectors.useOriginal, 'click', data, function(e) {
				$(this).parents('.smarty-popup').slideUp(defaults.speed, function() {
					$(this).parent('.smarty-ui').remove();
					$(this).remove();
				});

				undelegateAllClicks(e.data.selectors);
				delete e.data.selectors;
				trigger("OriginalInputSelected", e.data);
			});

			// User presses Esc key
			$(document).keyup(data, function(e) {
				if (e.keyCode == 27) { //Esc
					undelegateAllClicks(e.data.selectors);
					delete e.data.selectors;
					userAborted($('.smarty-popup.smarty-addr-' + e.data.address.id()), e);
					suppress(e);
				}
			});

			// User clicks "x" in corner or chooses to try a different address (same effect as Esc key)
			$('body').delegate(data.selectors.abort, 'click', data, function(e) {
				undelegateAllClicks(e.data.selectors);
				delete e.data.selectors;
				userAborted($(this).parents('.smarty-popup'), e);
			});
		};


		this.showInvalid = function(data) {
			if (!config.ui || !data.address.hasDomFields())
				return;

			var addr = data.address;
			var response = data.response;
			var corners = addr.corners();
			corners.width = Math.max(corners.width, 300); // minimum width
			corners.height = Math.max(corners.height, 180); // minimum height
			if(config.enforceVerification) {
				corners.height -= 49;
			}

			var html = '<div class="smarty-ui" style="top: ' + corners.top + 'px; left: ' + corners.left + 'px; width: ' +
				corners.width + 'px; height: ' + corners.height + 'px;">' + '<div class="smarty-popup smarty-addr-' +
				addr.id() + '" style="width: ' + (corners.width - 6) + 'px; height: ' + (corners.height - 3) + 'px;">' +
				'<div class="smarty-popup-header smarty-popup-invalid-header">' + config.invalidMessage +
				'<a href="javascript:" class="smarty-popup-close smarty-abort" title="Cancel">x</a></div>' +
				'<div class="smarty-choice-list"><a href="javascript:" ' +
				'class="smarty-choice smarty-choice-abort smarty-abort">Click here to change your address</a></div>' +
				'<div class="smarty-choice-alt">';
				if(!config.enforceVerification) {
					html += '<a href="javascript:" class="smarty-choice smarty-choice-override">' +
					config.certifyMessage + '<br>(' + addr.toString() + ')</a>';
				}
				html +='</div></div></div>';

			$(html).hide().appendTo('body').show(defaults.speed);

			data.selectors = {
				useOriginal: '.smarty-popup.smarty-addr-' + addr.id() + ' .smarty-choice-override ',
				abort: '.smarty-popup.smarty-addr-' + addr.id() + ' .smarty-abort'
			};

			// Scroll to it if necessary
			if ($(document).scrollTop() > corners.top - 100 || $(document).scrollTop() < corners.top - $(window).height() + 100) {
				$('html, body').stop().animate({
					scrollTop: $('.smarty-popup.smarty-addr-' + addr.id()).offset().top - 100
				}, 500);
			}

			undelegateAllClicks(data.selectors.abort);
			// User rejects original input and agrees to double-check it
			$('body').delegate(data.selectors.abort, 'click', data, function(e) {
				userAborted('.smarty-popup.smarty-addr-' + e.data.address.id(), e);
				delete e.data.selectors;
				trigger("InvalidAddressRejected", e.data);
			});

			undelegateAllClicks(data.selectors.useOriginal);
			// User certifies that what they typed is correct
			$('body').delegate(data.selectors.useOriginal, 'click', data, function(e) {
				userAborted('.smarty-popup.smarty-addr-' + e.data.address.id(), e);
				delete e.data.selectors;
				trigger("OriginalInputSelected", e.data);
			});

			// User presses esc key
			$(document).keyup(data, function(e) {
				if (e.keyCode == 27) { //Esc
					$(data.selectors.abort).click();
					undelegateAllClicks(e.data.selectors);
					userAborted('.smarty-popup.smarty-addr-' + e.data.address.id(), e);
				}
			});
		};

	}

	/*
		Represents an address inputted by the user, whether it has been verified yet or not.
		formObj must be a Form OBJECT, not a <form> tag... and the addressID is optional.
	*/
	function Address(domMap, formObj, addressID) {
		// PRIVATE MEMBERS //

		var self = this; // Pointer to self so that internal functions can reference its parent
		var fields; // Data values and references to DOM elements
		var id; // An ID by which to classify this address on the DOM

		var state = "accepted"; // Can be: "accepted" or "changed"
		// Example of a field:  street: { value: "123 main", dom: DOMElement, undo: "123 mai"}
		// Some of the above fields will only be mapped manually, not automatically.

		// Private method that actually changes the address. The keepState parameter is
		// used by the results of verification after an address is chosen; (or an "undo"
		// on a freeform address), otherwise an infinite loop of requests is executed
		// because the address keeps changing! (Set "suppressAutoVerify" to true when coming from the "Undo" link)	
		var doSet = function(key, value, updateDomElement, keepState, sourceEvent, suppressAutoVerify) {
			if (!arrayContains(acceptableFields, key)) // Skip "id" and other unacceptable fields
				return false;

			if (!fields[key])
				fields[key] = {};

			value = value.replace(/<|>/g, ""); // prevents script injection attacks (< and > aren't in addresses, anyway)

			var differentVal = fields[key].value != value;

			fields[key].undo = fields[key].value || "";
			fields[key].value = value;

			if (updateDomElement && fields[key].dom) {
				$(fields[key].dom).val(value);
			}

			var eventMeta = {
				sourceEvent: sourceEvent, // may be undefined
				field: key,
				address: self,
				value: value,
				suppressAutoVerification: suppressAutoVerify || false
			};

			if (differentVal && !keepState) {
				ui.unmarkAsValid(self);
				var uiTag = config.ui ? $('.smarty-ui .smarty-tag.smarty-addr-' + id) : undefined;
				if (uiTag && !uiTag.is(':visible'))
					uiTag.show(); // Show checkmark tag if address is in US
				self.unaccept();
				trigger("AddressChanged", eventMeta);
			}

			return true;
		};

		// PUBLIC MEMBERS //

		this.form = formObj; // Reference to the parent form object (NOT THE DOM ELEMENT)
		this.verifyCount = 0; // Number of times this address was submitted for verification
		this.lastField; // The last field found (last to appear in the DOM) during mapping, or the order given
		this.active = true; // If true, verify the address. If false, pass-thru entirely.

		// Constructor-esque functionality (save the fields in this address object)
		this.load = function(domMap, addressID) {
			fields = {};
			id = addressID ? addressID.replace(/[^a-z0-9_\-]/ig, '') : randomInt(1, 99999); // Strips non-selector-friendly characters

			if (typeof domMap === 'object') { // can be an actual map to DOM elements or just field/value data
				// Find the last field likely to appear on the DOM (used for UI attachments)
				this.lastField = domMap.country || domMap.freeform || domMap.postal_code || domMap.administrative_area || domMap.locality || domMap.address1;

				var isEmpty = true; // Whether the address has data in it (pre-populated) -- first assume it is empty.

				for (var prop in domMap) {
					if (!arrayContains(acceptableFields, prop)) // Skip "id" and any other unacceptable field
						continue;

					var elem, val, elemArray, isData;
					try {
						elem = $(domMap[prop]);
						elemArray = elem.toArray();
						isData = elemArray ? elemArray.length == 0 : false;
					} catch (e) {
						isData = true;
					}

					if (isData) // Didn't match an HTML element, so treat it as an address string ("street1" data) instead
						val = domMap[prop] || "";
					else
						val = elem.val() || "";

					fields[prop] = {};
					fields[prop].value = val;
					fields[prop].undo = val;

					if (!isData) {
						if (config.debug) {
							elem.css('background', '#FFFFCC');
							elem.attr('placeholder', prop + ":" + id);
						}
						fields[prop].dom = domMap[prop];
					}


					// This has to be passed in at bind-time; they cannot be obtained at run-time
					var data = {
						address: this,
						field: prop,
						value: val
					};

					// Bind the DOM element to needed events, passing in the data above
					// NOTE: When the user types a street, city, and state, then hits Enter without leaving
					// the state field, this change() event fires before the form is submitted, and if autoVerify is
					// on, the verification will not invoke form submit, because it didn't come from a form submit.
					// This is known behavior and is actually proper functioning in this uncommon edge case.
					!isData && $(domMap[prop]).change(data, function(e) {
						e.data.address.set(e.data.field, e.target.value, false, false, e, false);
					});
				}

				state = "changed";
			}
		};

		// Run the "constructor" to load up the address
		this.load(domMap, addressID);


		this.set = function(key, value, updateDomElement, keepState, sourceEvent, suppressAutoVerify) {
			if (typeof key === 'string' && arguments.length >= 2)
				return doSet(key, value, updateDomElement, keepState, sourceEvent, suppressAutoVerify);
			else if (typeof key === 'object') {
				var successful = true;
				for (var prop in key)
					successful = doSet(prop, key[prop], updateDomElement, keepState, sourceEvent, suppressAutoVerify) ? successful : false;
				return successful;
			}
		};

		this.replaceWith = function(resp, updateDomElement, e) {
			// Given the response from an API request associated with this address,
			// replace the values in the address... and if updateDomElement is true,
			// then change the values in the fields on the page accordingly.

			if (typeof resp === 'array' && resp.length > 0)
				resp = resp[0];

			if (self.isFreeform()) {
				var singleLineAddr = (resp.organization ? resp.organization + " " : "") +
					(resp.address1 ? resp.address1 + " " : "") +
					(resp.address2 ? resp.address2 + " " : "") +
					(resp.address3 ? resp.address3 + " " : "") +
					(resp.address4 ? resp.address4 + " " : "") +
					(resp.address5 ? resp.address5 + " " : "") +
					(resp.address6 ? resp.address6 + " " : "") +
					(resp.address7 ? resp.address7 + " " : "") +
					(resp.address8 ? resp.address8 + " " : "") +
					(resp.address9 ? resp.address9 + " " : "") +
					(resp.address10 ? resp.address10 + " " : "") +
					(resp.address11 ? resp.address11 + " " : "") +
					(resp.address12 ? resp.address12 + " " : "");
				var countryLine = resp.components.country_iso_3 ? resp.components.country_iso_3 : "";
				self.set("freeform", singleLineAddr, updateDomElement, true, e, false);
				self.set("country", countryLine, updateDomElement, true, e, false);
			} else {
				if (resp.organization)
					self.set("organization", resp.organization, updateDomElement, true, e, false);
				if (resp.components.locality)
					self.set("locality", resp.components.locality, updateDomElement, true, e, false);
				if (resp.components.administrative_area)
					self.set("administrative_area", resp.components.administrative_area, updateDomElement, true, e, false);
				if (resp.components.postal_code_short) {
					var fullPostalCode = resp.components.postal_code_short;
					if(resp.components.postal_code_extra)
						fullPostalCode = fullPostalCode + "-" + resp.components.postal_code_extra;
					self.set("postal_code", fullPostalCode, updateDomElement, true, e, false);
				}
				if (this.getDomFields().address4) {
					if (resp.address1)
						self.set("address1", resp.address1, updateDomElement, true, e, false);
					if (resp.address2)
						self.set("address2", resp.address2, updateDomElement, true, e, false);
					if (resp.address3)
						self.set("address3", resp.address3, updateDomElement, true, e, false);
					var addressLine4 = "";
					addressLine4 = addAddressLine(addressLine4, resp.address4, resp.address5);
					addressLine4 = addAddressLine(addressLine4, resp.address5, resp.address6);
					addressLine4 = addAddressLine(addressLine4, resp.address6, resp.address7);
					addressLine4 = addAddressLine(addressLine4, resp.address7, resp.address8);
					addressLine4 = addAddressLine(addressLine4, resp.address8, resp.address9);
					addressLine4 = addAddressLine(addressLine4, resp.address9, resp.address10);
					addressLine4 = addAddressLine(addressLine4, resp.address10, resp.address11);
					addressLine4 = addAddressLine(addressLine4, resp.address11, resp.address12);
					self.set("address4", addressLine4, updateDomElement, true, e, false);
				} else if (this.getDomFields().address3) {
					if (resp.address1)
						self.set("address1", resp.address1, updateDomElement, true, e, false);
					if (resp.address2)
						self.set("address2", resp.address2, updateDomElement, true, e, false);
					var addressLine3 = "";
					addressLine3 = addAddressLine(addressLine3, resp.address3, resp.address4);
					addressLine3 = addAddressLine(addressLine3, resp.address4, resp.address5);
					addressLine3 = addAddressLine(addressLine3, resp.address5, resp.address6);
					addressLine3 = addAddressLine(addressLine3, resp.address6, resp.address7);
					addressLine3 = addAddressLine(addressLine3, resp.address7, resp.address8);
					addressLine3 = addAddressLine(addressLine3, resp.address8, resp.address9);
					addressLine3 = addAddressLine(addressLine3, resp.address9, resp.address10);
					addressLine3 = addAddressLine(addressLine3, resp.address10, resp.address11);
					addressLine3 = addAddressLine(addressLine3, resp.address11, resp.address12);
					self.set("address3", addressLine3, updateDomElement, true, e, false);
				} else if (this.getDomFields().address2) {
					if (resp.address1)
						self.set("address1", resp.address1, updateDomElement, true, e, false);
					var addressLine2 = "";
					addressLine2 = addAddressLine(addressLine2, resp.address2, resp.address3);
					addressLine2 = addAddressLine(addressLine2, resp.address3, resp.address4);
					addressLine2 = addAddressLine(addressLine2, resp.address4, resp.address5);
					addressLine2 = addAddressLine(addressLine2, resp.address5, resp.address6);
					addressLine2 = addAddressLine(addressLine2, resp.address6, resp.address7);
					addressLine2 = addAddressLine(addressLine2, resp.address7, resp.address8);
					addressLine2 = addAddressLine(addressLine2, resp.address8, resp.address9);
					addressLine2 = addAddressLine(addressLine2, resp.address9, resp.address10);
					addressLine2 = addAddressLine(addressLine2, resp.address10, resp.address11);
					addressLine2 = addAddressLine(addressLine2, resp.address11, resp.address12);
					self.set("address2", addressLine2, updateDomElement, true, e, false);
				} else if (this.getDomFields().address1) {
					var addressLine1 = "";
					addressLine1 = addAddressLine(addressLine1, resp.address1, resp.address2);
					addressLine1 = addAddressLine(addressLine1, resp.address2, resp.address3);
					addressLine1 = addAddressLine(addressLine1, resp.address3, resp.address4);
					addressLine1 = addAddressLine(addressLine1, resp.address4, resp.address5);
					addressLine1 = addAddressLine(addressLine1, resp.address5, resp.address6);
					addressLine1 = addAddressLine(addressLine1, resp.address6, resp.address7);
					addressLine1 = addAddressLine(addressLine1, resp.address7, resp.address8);
					addressLine1 = addAddressLine(addressLine1, resp.address8, resp.address9);
					addressLine1 = addAddressLine(addressLine1, resp.address9, resp.address10);
					addressLine1 = addAddressLine(addressLine1, resp.address10, resp.address11);
					addressLine1 = addAddressLine(addressLine1, resp.address11, resp.address12);
					self.set("address1", addressLine1, updateDomElement, true, e, false);
				}
				if (resp.components.country_iso_3)
					self.set("country", resp.components.country_iso_3, updateDomElement, true, e, false);
				
			}
		};

		var addAddressLine = function(fullLine, addressLine, nextAddressLine) {
			if(addressLine && nextAddressLine) {
				if(fullLine != "")
					fullLine += " "; 
				fullLine += addressLine;
			}
			return fullLine;
		};

		this.corners = function(lastField) {
			var corners = {};

			if (!lastField) {
				for (var prop in fields) {
					if (!fields[prop].dom || !$(fields[prop].dom).is(':visible'))
						continue;

					var dom = fields[prop].dom;
					var offset = $(dom).offset();
					offset.right = offset.left + $(dom).outerWidth(false);
					offset.bottom = offset.top + $(dom).outerHeight(false);

					corners.top = !corners.top ? offset.top : Math.min(corners.top, offset.top);
					corners.left = !corners.left ? offset.left : Math.min(corners.left, offset.left);
					corners.right = !corners.right ? offset.right : Math.max(corners.right, offset.right);
					corners.bottom = !corners.bottom ? offset.bottom : Math.max(corners.bottom, offset.bottom);
				}
			} else {
				var jqDom = $(self.lastField);
				corners = jqDom.offset();
				corners.right = corners.left + jqDom.outerWidth(false);
				corners.bottom = corners.top + jqDom.outerHeight(false);
			}

			corners.width = corners.right - corners.left;
			corners.height = corners.bottom - corners.top;

			return corners;
		};

		this.verify = function(invoke, invokeFn) {
			// Invoke contains the element to "click" on once we're all done, or is a user-defined callback function (may also be undefined)
			if (!invoke && !self.enoughInput()) {
				if (config.debug)
					console.log("NOTICE: The address does not have enough input to verify. Since no callback is specified, there is nothing to do.");
				return trigger("Completed", {
					address: self,
					invoke: invoke,
					invokeFn: invokeFn,
					response: new Response([])
				});
			}

			if (!self.enoughInput())
				return trigger("AddressWasInvalid", {
					address: self,
					response: new Response([]),
					invoke: invoke,
					invokeFn: invokeFn
				});

			ui.disableFields(self);
			self.verifyCount++;
			var addrData = self.toRequest();
			var credentials = config.token ? "auth-id=" + encodeURIComponent(config.key) + "&auth-token=" +
				encodeURIComponent(config.token) : "auth-id=" + encodeURIComponent(config.key);

			$.ajax({
					url: config.requestUrl + "?" + credentials + "&plugin=" + encodeURIComponent(instance.version) +
						(config.debug ? "_debug" : ""),
					contentType: "jsonp",
					data: addrData,
					timeout: config.timeout
				})
				.done(function(response, statusText, xhr) {
					trigger("ResponseReceived", {
						address: self,
						response: new Response(response),
						invoke: invoke,
						invokeFn: invokeFn
					});
				})
				.fail(function(xhr, statusText) {
					trigger("RequestTimedOut", {
						address: self,
						status: statusText,
						invoke: invoke,
						invokeFn: invokeFn
					});
					self.verifyCount--; // Address verification didn't actually work, so don't count it
				});

			// Remember, the above callbacks happen later and this function is
			// executed immediately afterward, probably before a response is received.
			trigger("RequestSubmitted", {
				address: self
			});
		};

		this.enoughInput = function() {
			return (fields.country && fields.country.value) && (
				(fields.freeform && fields.freeform.value) ||
				((fields.address1 && fields.address1.value) && (fields.postal_code && fields.postal_code.value)) ||
				((fields.address1 && fields.address1.value) && (fields.locality && fields.locality.value) && (fields.administrative_area && fields.administrative_area.value))
			);
		};

		this.toRequest = function() {
			var obj = {};
			if (fields.hasOwnProperty("freeform") &&
				fields.hasOwnProperty("address1") &&
				fields.hasOwnProperty("locality") &&
				fields.hasOwnProperty("administrative_area") &&
				fields.hasOwnProperty("postal_code")) {
				delete fields.address1;
				delete fields.locality;
				delete fields.administrative_area;
				delete fields.postal_code;
			}
			for (var key in fields) {
				var keyval = {};
				keyval[key] = fields[key].value.replace(/\r|\n/g, " "); // Line breaks to spaces
				$.extend(obj, keyval);
			}
			obj.geocode = config.geocode;
			return obj;
		};

		this.toString = function() {
			if(fields.freeform) {
				return (fields.freeform ? fields.freeform.value + " " : "") + (fields.country ? fields.country.value : "");
			} else {
				return (fields.address1 ? fields.address1.value + " " : "") + (fields.locality ? fields.locality.value + " " : "") + (fields.administrative_area ? fields.administrative_area.value + " " : "") + (fields.postal_code ? fields.postal_code.value : "");
			}
		};

		this.abort = function(event, keepAccept) {
			keepAccept = typeof keepAccept === 'undefined' ? false : keepAccept;
			if (!keepAccept)
				self.unaccept();
			delete self.form.processing;
			return suppress(event);
		};

		// Based on the properties in "fields," determines if this is a single-line address
		this.isFreeform = function() {
			return fields.freeform && fields.country;
		};

		this.get = function(key) {
			return fields[key] ? fields[key].value : null
		};

		this.undo = function(updateDomElement) {
			updateDomElement = typeof updateDomElement === 'undefined' ? true : updateDomElement;
			for (var key in fields)
				this.set(key, fields[key].undo, updateDomElement, false, undefined, true);
		};

		this.accept = function(data, showValid) {
			showValid = typeof showValid === 'undefined' ? true : showValid;
			state = "accepted";
			ui.enableFields(self);
			if (showValid) // If user chooses original input or the request timed out, the address wasn't "verified"
				ui.markAsValid(self);
			trigger("AddressAccepted", data);
		};

		this.unaccept = function() {
			state = "changed";
			ui.unmarkAsValid(self);
			return self;
		};

		this.getUndoValue = function(key) {
			return fields[key].undo;
		};

		this.status = function() {
			return state;
		};

		this.getDomFields = function() {
			// Gets just the DOM elements for each field
			var obj = {};
			for (var prop in fields) {
				var ext = {};
				ext[prop] = fields[prop].dom;
				$.extend(obj, ext);
			}
			return obj;
		};

		this.hasDomFields = function() {
			for (var prop in fields)
				if (fields[prop].dom)
					return true;
		};

		this.id = function() {
			return id;
		};
	}

	/*
		Represents a <form> tag which contains mapped fields.
	*/
	function Form(domElement) {
		this.addresses = [];
		this.dom = domElement;

		this.activeAddressesNotAccepted = function() {
			var addrs = [];
			for (var i = 0; i < this.addresses.length; i++) {
				var addr = this.addresses[i];
				if (addr.status() != "accepted" && addr.active)
					addrs.push(addr);
			}
			return addrs;
		};

		this.allActiveAddressesAccepted = function() {
			return this.activeAddressesNotAccepted().length == 0;
		};
	}

	/*
		Wraps output from the API in an easier-to-handle way
	*/

	function Response(json) {
		// PRIVATE MEMBERS //

		var checkBounds = function(idx) {
			// Ensures that an index is within the number of candidates
			if (idx >= json.length || idx < 0) {
				if (json.length == 0)
					throw new Error("Candidate index is out of bounds (no candidates returned; requested " + idx + ")");
				else
					throw new Error("Candidate index is out of bounds (" + json.length + " candidates; indicies 0 through " +
						(json.length - 1) + " available; requested " + idx + ")");
			}
		};

		var maybeDefault = function(idx) {
			// Assigns index to 0, the default value, if no value is passed in
			return typeof idx === 'undefined' ? 0 : idx;
		};


		// PUBLIC-FACING MEMBERS //

		this.raw = json;
		this.length = json.length;

		this.isValid = function() {
			return (this.length == 1 && this.raw[0].analysis.verification_status == "Verified");
		};

		this.isInvalid = function() {
			return (this.length == 0 || (this.length == 1 && this.raw[0].analysis.verification_status != "Verified"));
		};

		this.isAmbiguous = function() {
			return this.length > 1;
		};

		// These next functions are not comprehensive, but helpful for common tasks.

		this.isExactMatch = function(idx) {
			idx = maybeDefault(idx);
			checkBounds(idx);
			return this.raw[idx].analysis.address_precision == "DeliveryPoint";
		};
	}


	/*
	 *	EVENT HANDLER "SHTUFF"
	 */


	/*
		Called every time a LiveAddress event is raised.
		This allows us to maintain the binding even if the
		callback function is changed later.
		"event" is the actual event object, and
		"data" is anything extra to pass to the event handler.
	*/
	function HandleEvent(event, data) {
		var handler = EventHandlers[event.type];
		if (handler)
			handler(event, data);
	}

	// Submits a form by calling `click` on a button element or `submit` on a form element
	var submitForm = function(invokeOn, invokeFunction) {
		if (invokeOn && typeof invokeOn !== 'function' && invokeFunction) {
			if (invokeFunction == "click") {
				setTimeout(function() {
					$(invokeOn).click(); // Very particular: we MUST fire the native 'click' event!
				}, 5);
			} else if (invokeFunction == "submit")
				$(invokeOn).submit(); // For submit(), we have to use jQuery's, so that all its submit handlers fire.
		}
	};

	var EventHandlers = {
		FieldsMapped: function(event, data) {
			if (config.debug)
				console.log("EVENT:", "FieldsMapped", "(Fields mapped to their respective addresses)", event, data);

			// We wait until the window is all loaded in case some elements are still loading
			window.loaded ? ui.postMappingOperations() : $(window).load(ui.postMappingOperations);
		},

		MapInitialized: function(event, data) {
			if (config.debug)
				console.log("EVENT:", "MapInitialized", "(Mapped fields have been wired up to the window" +
					(config.ui ? ", document, and UI" : " and document") + ")", event, data);
		},

		AddressChanged: function(event, data) {
			if (config.debug)
				console.log("EVENT:", "AddressChanged", "(Address changed)", event, data);

			// If autoVerify is on, AND there's enough input in the address,
			// AND it hasn't been verified automatically before -OR- it's a freeform address,
			// AND autoVerification isn't suppressed (from an Undo click, even on a freeform address)
			// AND it has a DOM element (it's not just a programmatic Address object)
			// AND the address is "active" for verification
			// AND the form, if any, isn't already chewing on an address...
			// THEN verification has been invoked.
			if (config.autoVerify && data.address.enoughInput() && (data.address.verifyCount == 0 ||
					data.address.isFreeform()) && !data.suppressAutoVerification && data.address.hasDomFields() &&
				data.address.active &&
				(data.address.form && !data.address.form.processing))
				trigger("VerificationInvoked", {
					address: data.address
				});
		},

		VerificationInvoked: function(event, data) {
			if (config.debug)
				console.log("EVENT:", "VerificationInvoked", "(Address verification invoked)", event, data);

			// Abort now if an address in the same form is already being processed
			if (!data.address || (data.address && data.address.form && data.address.form.processing)) {
				if (config.debug)
					console.log("NOTICE: VerificationInvoked event handling aborted. Address is missing or an address in the " +
						"same form is already processing.");
				return;
			} else if (data.address.status() == "accepted" && !data.verifyAccepted) {
				if (config.debug)
					console.log("NOTICE: VerificationInvoked raised on an accepted or un-changed address. Nothing to do.");
				return trigger("Completed", data);
			} else if (data.address.form)
				data.address.form.processing = true;

			data.address.verify(data.invoke, data.invokeFn);
		},

		RequestSubmitted: function(event, data) {
			if (config.debug)
				console.log("EVENT:", "RequestSubmitted", "(Request submitted to server)", event, data);

			ui.showLoader(data.address);
		},

		ResponseReceived: function(event, data) {
			if (config.debug)
				console.log("EVENT:", "ResponseReceived",
					"(Response received from server, but has not been inspected)", event, data);

			ui.hideLoader(data.address);

			if (typeof data.invoke === "function")
				data.invoke(data.response); // User-defined callback function; we're all done here.
			if (data.response.isAmbiguous())
				trigger("AddressWasAmbiguous", data);
			else if (data.response.isValid())
				trigger("AddressWasValid", data);
			else if (data.response.isInvalid())
				trigger("AddressWasInvalid", data);
		},

		RequestTimedOut: function(event, data) {
			if (config.debug)
				console.log("EVENT:", "RequestTimedOut", "(Request timed out)", event, data);

			if (data.address.form)
				delete data.address.form.processing; // Tell the potentially duplicate event handlers that we're done.

			// If this was a form submit, don't let a network failure hold them back; just accept it and move on
			if (data.invoke)
				data.address.accept(data, false);

			ui.enableFields(data.address);
			ui.hideLoader(data.address);
		},

		AddressWasValid: function(event, data) {
			if (config.debug)
				console.log("EVENT:", "AddressWasValid", "(Response indicates input address was valid)", event, data);

			var addr = data.address;
			var resp = data.response;

			data.response.chosen = resp.raw[0];
			addr.replaceWith(resp.raw[0], true, event);
			addr.accept(data);
		},

		AddressWasAmbiguous: function(event, data) {
			if (config.debug)
				console.log("EVENT:", "AddressWasAmbiguous", "(Response indiciates input address was ambiguous)", event, data);

			ui.showAmbiguous(data);
		},

		AddressWasInvalid: function(event, data) {
			if (config.debug)
				console.log("EVENT:", "AddressWasInvalid", "(Response indicates input address was invalid)", event, data);

			ui.showInvalid(data);
		},

		OriginalInputSelected: function(event, data) {
			if (config.debug)
				console.log("EVENT:", "OriginalInputSelected", "(User chose to use original input)", event, data);

			data.address.accept(data, false);
		},

		InvalidAddressRejected: function(event, data) {
			if (config.debug)
				console.log("EVENT:", "InvalidAddressRejected", "(User chose to correct an invalid address)", event, data);

			if (data.address.form)
				delete data.address.form.processing; // We're done with this address and ready for the next, potentially

			trigger("Completed", data);
		},

		AddressAccepted: function(event, data) {
			if (config.debug)
				console.log("EVENT:", "AddressAccepted", "(Address marked accepted)", event, data);

			if (!data)
				data = {};

			if (data.address && data.address.form)
				delete data.address.form.processing; // We're done with this address and ready for the next, potentially

			// If this was the result of a form submit, re-submit the form (whether by clicking the button or raising form submit event)
			if (data.invoke && data.invokeFn)
				submitForm(data.invoke, data.invokeFn);

			trigger("Completed", data);
		},

		Completed: function(event, data) {
			if (config.debug)
				console.log("EVENT:", "Completed", "(All done)", event, data);

			if (data.address) {
				ui.enableFields(data.address);
				if (data.address.form)
					delete data.address.form.processing; // We're done with this address and ready for the next, potentially
			}
		}
	};


	/*
	 *	MISCELLANEOUS
	 */

	function arrayContains(array, subject) {
		// See if an array contains a particular value
		for (var i in array)
			if (array[i] === subject) return true;
		return false;
	}

	function randomInt(min, max) {
		// Generate a random integer between min and max
		return Math.floor(Math.random() * (max - min + 1)) + min;
	}

	function lowercase(string) {
		// Return an empty string if not defined, or a lowercase string with '[]' stripped.
		return string ? string.toLowerCase().replace('[]', '') : '';
	}

	function trigger(eventType, metadata) {
		// Raise an event (in our case, a custom event)
		$(document).triggerHandler(eventType, metadata);
	}

	function bind(eventType) {
		// Bind a custom handler to an event
		$(document).bind(eventType, HandleEvent);
	}

	function suppress(event) {
		// Used to prevent form submits, and stop other events if needed
		if (!event) return false;
		if (event.preventDefault) event.preventDefault();
		if (event.stopPropagation) event.stopPropagation();
		if (event.stopImmediatePropagation) event.stopImmediatePropagation();
		event.cancelBubble = true;
		return false;
	}

})(jQuery, window, document);
