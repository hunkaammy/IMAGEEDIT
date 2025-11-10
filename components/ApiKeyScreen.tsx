/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';
import Header from './Header';
import { KeyIcon } from './icons';

interface ApiKeyScreenProps {
  onKeySubmit: (key: string) => void;
  initialError?: string | null;
}

const ApiKeyScreen: React.FC<ApiKeyScreenProps> = ({ onKeySubmit, initialError }) => {
    const [apiKey, setApiKey] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (apiKey.trim()) {
            onKeySubmit(apiKey.trim());
        }
    };

    return (
        <div className="min-h-screen text-gray-100 flex flex-col w-full">
            <Header />
            <main className="flex-grow w-full max-w-[1600px] mx-auto p-4 md:p-8 flex justify-center items-center">
                <div className="w-full max-w-xl mx-auto text-center p-8 bg-gray-800/50 border border-gray-700/80 rounded-2xl flex flex-col items-center gap-6 animate-fade-in backdrop-blur-sm shadow-2xl">
                    <div className="flex items-center justify-center w-16 h-16 bg-gray-700 rounded-full mb-2">
                        <KeyIcon className="w-8 h-8 text-blue-400" />
                    </div>
                    <h1 className="text-3xl font-bold text-gray-100">Enter Your Gemini API Key</h1>
                    <p className="text-lg text-gray-400">
                        To use the generative AI features, please enter your Google AI API key below.
                    </p>
                    
                    {initialError && (
                        <p className="text-md text-red-400 bg-red-500/10 border border-red-500/20 p-3 rounded-lg w-full">
                            {initialError}
                        </p>
                    )}

                    <form onSubmit={handleSubmit} className="w-full flex flex-col items-center gap-4">
                        <input
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="Enter your API key here"
                            className="w-full bg-gray-900 border border-gray-600 text-gray-200 text-center rounded-lg p-4 focus:ring-2 focus:ring-blue-500 focus:outline-none transition text-base"
                            autoComplete="off"
                        />
                        <button
                            type="submit"
                            disabled={!apiKey.trim()}
                            className="w-full sm:w-auto flex-shrink-0 bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-4 px-8 text-lg rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner disabled:from-gray-600 disabled:to-gray-500 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
                        >
                            Continue
                        </button>
                    </form>
                    
                    <p className="text-sm text-gray-500 max-w-md">
                        Your key is stored in your browser's session storage and is never sent to our servers. Get a key from{' '}
                        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                            Google AI Studio
                        </a>.
                    </p>
                </div>
            </main>
        </div>
    );
};

export default ApiKeyScreen;
