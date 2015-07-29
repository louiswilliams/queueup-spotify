/*
	Fractal by HTML5 UP
	html5up.net | @n33co
	Free for personal and commercial use under the CCA 3.0 license (html5up.net/license)
*/

(function($) {

	skel.breakpoints({
		xlarge:		'(max-width: 1680px)',
		large:		'(max-width: 1280px)',
		medium:		'(max-width: 980px)',
		small:		'(max-width: 736px)',
		xsmall:		'(max-width: 480px)',
		xxsmall:	'(max-width: 360px)'
	});

	$(function() {

		var	$window = $(window),
			$body = $('body');

		// Disable animations/transitions until the page has loaded.
			$body.addClass('is-loading');

			$window.on('load', function() {
				window.setTimeout(function() {
					$body.removeClass('is-loading');
				}, 100);
			});

		// Mobile?
			if (skel.vars.mobile)
				$body.addClass('is-mobile');
			else
				skel
					.on('-medium !medium', function() {
						$body.removeClass('is-mobile');
					})
					.on('+medium', function() {
						$body.addClass('is-mobile');
					});

		// Fix: Placeholder polyfill.
			$('form').placeholder();

		// Prioritize "important" elements on medium.
			skel.on('+medium -medium', function() {
				$.prioritize(
					'.important\\28 medium\\29',
					skel.breakpoint('medium').active
				);
			});

		// Scrolly.
			$('.scrolly')
				.scrolly({
					speed: 1500
				});

		/* Play video*/
		$window.on('scroll', function () {
			$("video").each(function (i, video) {
				$video = $(video);
				var videoTop = $video.offset().top;
				var videoBottom = videoTop + $video.height();
				var windowTop = window.pageYOffset;
				var windowBottom = windowTop + window.innerHeight;
				
				/* Showing at all */
				if (windowBottom > videoTop && videoBottom > windowTop) {

					/* Showing fully */
					if (videoTop > windowTop && windowBottom > videoBottom) {
						if (video.paused) {
							video.play();							
						}
					} else {
						if (!video.paused) {
							video.pause();
						}
					}
				}


			})
		});
	});


})(jQuery);