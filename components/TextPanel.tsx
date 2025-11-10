/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';

interface TextPanelProps {
  text: string;
  setText: (text: string) => void;
  textColor: string;
  setTextColor: (color: string) => void;
  textSize: number;
  setTextSize: (size: number) => void;
}

const TextPanel: React.FC<TextPanelProps> = ({
  text,
  setText,
  textColor,
  setTextColor,
  textSize,
  setTextSize,
}) => {
  return (
    <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-4 flex flex-col items-center gap-4 animate-fade-in backdrop-blur-sm">
      <h3 className="text-lg font-semibold text-gray-300">Add Bold Text</h3>
      <p className="text-sm text-gray-400 -mt-2">Type your text below. Drag it on the image to position.</p>

      <div className="w-full flex flex-col md:flex-row items-center gap-4">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter your bold text here"
          className="flex-grow bg-gray-800 border border-gray-600 text-gray-200 rounded-lg p-4 focus:ring-2 focus:ring-blue-500 focus:outline-none transition w-full text-base"
        />
        <div className="flex items-center gap-3">
          <label htmlFor="text-color" className="text-sm font-medium text-gray-400">
            Color:
          </label>
          <input
            id="text-color"
            type="color"
            value={textColor}
            onChange={(e) => setTextColor(e.target.value)}
            className="w-10 h-10 rounded-md border-none cursor-pointer bg-gray-700"
          />
        </div>
      </div>

      <div className="w-full flex items-center gap-4">
        <label htmlFor="text-size" className="text-sm font-medium text-gray-400">
          Size:
        </label>
        <input
          id="text-size"
          type="range"
          min="12"
          max="128"
          value={textSize}
          onChange={(e) => setTextSize(parseInt(e.target.value, 10))}
          className="flex-grow h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
        />
        <span className="text-sm text-gray-300 w-10 text-center">{textSize}px</span>
      </div>
    </div>
  );
};

export default TextPanel;