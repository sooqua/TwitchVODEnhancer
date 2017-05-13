// ==UserScript==
// @name         TwitchVODEnhancer
// @author       sooqua
// @namespace    https://github.com/sooqua/
// @downloadURL  https://github.com/sooqua/TwitchVODEnhancer/raw/master/TwitchVODEnhancer.user.js
// @version      0.2
// @match        *://*.twitch.tv/*
// @run-at       document-start
// @grant        GM_addStyle
// ==/UserScript==
(function() {
    'use strict';

    var client_id = 'ENTER_YOUR_CLIENT_ID';
    const canvas_width = 2500;
    const canvas_height = 50;
    const slider_height = 2.6;
    const slider_height_unit = 'em';
    const zoom = 3;
    const step = 60000; // msec.
    const gradient = [
        [
            0,
            [0, 0, 0]
        ],
        [
            25,
            [60, 100, 90]
        ],
        [
            30,
            [132, 220, 198]
        ],
        [
            33,
            [165, 255, 214]
        ],
        [
            35,
            [255, 222, 158]
        ],
        [
            85,
            [255, 166, 158]
        ],
        [
            100,
            [255, 104, 107]
        ]
    ];
    const slider_half_height = slider_height / 2;

    let steps_data_mc = [];
    let steps_data_ts = [];

    let observer;

    async function init() {
        await initOn(document);
        observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                mutation.addedNodes.forEach(async function(node) {
                    if (node instanceof HTMLElement) {
                        await initOn(node);
                    }
                });
            });
        });
        observer.observe(document.body, {childList: true, subtree: true});
    }

    async function initOn(base) {
        let slider = base.querySelector('.js-player-slider');
        if (!slider) return;
        let slider_handle = base.querySelector('.ui-slider-handle');
        if (!slider_handle) return;
        observer.disconnect();

        let wrapper = document.createElement('div');
        wrapper.className = 'canvasWrapper';

        let c = document.createElement('canvas');
        c.className = 'sliderCanvas';
        c.width = canvas_width;
        c.height = canvas_height;
        c.style.width = '100%';
        c.style.height = slider_height + slider_height_unit;

        wrapper.appendChild(c);
        slider.appendChild(wrapper);

        let sheet;
        c.addEventListener('mousemove', function(e) {
            let r = c.getBoundingClientRect();
            let p = (e.pageX - r.left) / r.width * 100;
            c.style.transformOrigin = p + '% center 0px';
            let scaled_p = (parseFloat(slider_handle.style.left, 10) * zoom - p * zoom + p).clamp(0, 100);
            sheet = setStyle(`
            .ui-slider-handle {
                left: ${scaled_p}% !important;
            }
            .ui-slider-range {
                width: ${scaled_p}% !important;
            }`, sheet);
        });
        c.addEventListener('mouseout', function() {
            sheet = setStyle('', sheet);
        });

        let vid_id = /twitch.tv\/videos\/(\d+)/.exec(window.location.href)[1];

        let r = await getJson('https://api.twitch.tv/kraken/videos/' + vid_id + '?client_id=' + client_id);

        let vid_start = new Date(r.recorded_at).getTime();
        let vid_length = r.length * 1000;
        let vid_end = vid_start + vid_length;

        let last_ts = vid_start;
        let last_step_ts = vid_start;
        let step_msg_count = 0;

        let ctx = c.getContext('2d');
        ctx.fillStyle = 'rgba(0, 0, 0, .5)';
        ctx.fillRect(0, 0, canvas_width, canvas_height);
        do {
            r = await getJson('https://rechat.twitch.tv/rechat-messages?video_id=v' + vid_id + '&start=' + Math.round(last_ts / 1000));
            if (r.data.length === 0) {
                last_ts = last_ts + 1000;
                continue;
            }

            for (let i = 0; i < r.data.length; i++) {
                step_msg_count++;
                let msg_ts = r.data[i].attributes.timestamp;
                if (msg_ts - last_step_ts >= step) {
                    steps_data_ts.push(msg_ts);
                    steps_data_mc.push(step_msg_count);
                    step_msg_count = 0;

                    let steps_data_min = Math.min(...steps_data_mc);
                    let steps_data_max = Math.max(...steps_data_mc);

                    for (let i = 0; i < steps_data_mc.length; i++) {
                        let pos = ((steps_data_ts[i] - vid_start) / (vid_end - vid_start)).clamp(0, 1);
                        let intensity = ((((steps_data_mc[i] - steps_data_min) / (steps_data_max - steps_data_min)) || 1) * 100).clamp(1, 100);
                        let color = pickGradientColor(intensity, gradient);
                        ctx.fillStyle = 'rgb('+color.join()+')';
                        let w = Math.round(step/vid_length*canvas_width);
                        ctx.fillRect(Math.round(pos*canvas_width) - w, 0, w, canvas_height);
                    }

                    last_step_ts = msg_ts;
                }

                if (i === r.data.length - 1) {
                    if (msg_ts === last_ts)
                        msg_ts = msg_ts + 1000;
                    last_ts = msg_ts;
                }
            }
        } while (last_ts < vid_end);
    }
    
    function getJson(url) {
        return new Promise(function(resolve) {
            let xhr = new XMLHttpRequest();
            xhr.addEventListener('load', function() { resolve(JSON.parse(this.responseText)); });
            xhr.open('GET', url,);
            xhr.send();
        });
    }

    function pickGradientColor(position, gradient) {
        let color_range = [];
        for (let i = 0; i < gradient.length; i++) {
            if (position<=gradient[i][0]) {
                color_range = [i-1,i];
                break;
            }
        }

        //Get the two closest colors
        let first_color = gradient[color_range[0]][1];
        let second_color = gradient[color_range[1]][1];

        //Calculate ratio between the two closest colors
        let first_color_x = gradient[color_range[0]][0]/100;
        let second_color_x = gradient[color_range[1]][0]/100-first_color_x;
        let slider_x = position/100-first_color_x;
        let ratio = slider_x/second_color_x;

        return pickHex( second_color,first_color, ratio );
    }

    function pickHex(color1, color2, weight) {
        let w = weight * 2 - 1;
        let w1 = (w+1) / 2;
        let w2 = 1 - w1;
        return [Math.round(color1[0] * w1 + color2[0] * w2),
            Math.round(color1[1] * w1 + color2[1] * w2),
            Math.round(color1[2] * w1 + color2[2] * w2)];
    }

    function setStyle(cssText) {
        let sheet = document.createElement('style');
        sheet.type = 'text/css';
        /* Optional */ window.customSheet = sheet;
        (document.head || document.getElementsByTagName('head')[0]).appendChild(sheet);
        return (setStyle = function(cssText, node) {
            if(!node || node.parentNode !== sheet)
                return sheet.appendChild(document.createTextNode(cssText));
            node.nodeValue = cssText;
            return node;
        })(cssText);
    }

    /**
    * Returns a number whose value is limited to the given range.
    *
    * Example: limit the output of this computation to between 0 and 255
    * (x * 255).clamp(0, 255)
    *
    * @param {Number} min The lower boundary of the output range
    * @param {Number} max The upper boundary of the output range
    * @returns A number in the range [min, max]
    * @type Number
    */
    Number.prototype.clamp = function(min, max) {
        return Math.min(Math.max(this, min), max);
    };

    GM_addStyle(`
    .player-seek {
        top: 0px !important;
    }
    .canvasWrapper {
        transform: translateZ(0) !important;
        overflow: hidden !important;
    }
    .js-player-slider:before {
        display: none !important;
    }
    .js-player-slider > .ui-slider-range {
        pointer-events: none !important;
        z-index: 1 !important;
        background: rgba(169, 145, 212, .5) !important;
        height: ${slider_height + slider_height_unit} !important;
        top: 0px !important;
        transition: initial !important;
    }
    .js-player-slider > .ui-slider-handle {
        pointer-events: none !important;
        width: .1em !important;
        height: ${slider_height + slider_height_unit} !important;
        background: black !important;
        border: .1em dotted white !important;
        margin-left: 0em !important;
        top: 0em !important;
        border-radius: initial !important;
        transition: initial !important;
    }
    .player-slider--roundhandle .ui-slider-handle:before {
        display: none !important;
    }
    .player-slider__popup-container {
        box-shadow: none !important;
        background: hsla(0,0%,0%,.5) !important;
    }
    .player-slider__muted-segments {
        pointer-events: none !important;
        height: ${slider_half_height + slider_height_unit} !important;
        top: ${slider_half_height + slider_height_unit} !important;
    }
    .player-slider__muted {
        pointer-events: none !important;
        height: ${slider_half_height + slider_height_unit} !important;
    }
    .sliderCanvas:hover {
        transform: scale(${zoom}, 1) !important;
    }`);

    document.addEventListener('DOMContentLoaded', init);
})();