import React, { useState } from 'react';

interface ComparisonSliderProps {
    beforeSrc: string;
    afterSrc: string;
}

const ComparisonSlider: React.FC<ComparisonSliderProps> = ({ beforeSrc, afterSrc }) => {
    const [sliderValue, setSliderValue] = useState(50);

    return (
        <div className="relative w-full h-full overflow-hidden select-none">
            <img src={afterSrc} alt="After" className="absolute inset-0 object-contain w-full h-full" />
            <div
                className="absolute top-0 left-0 h-full overflow-hidden"
                style={{ width: `${sliderValue}%` }}
            >
                <img src={beforeSrc} alt="Before" className="object-contain h-full w-full max-w-none" style={{ width: '100vw', maxWidth: 'inherit' }}/>
            </div>
            <div 
                className="absolute top-0 bottom-0 bg-white w-0.5 cursor-ew-resize"
                style={{ left: `calc(${sliderValue}% - 1px)` }}
            >
                <div className="absolute top-1/2 -mt-4 -ml-4 bg-white rounded-full h-8 w-8 flex items-center justify-center shadow-md">
                    <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4"></path>
                    </svg>
                </div>
            </div>
            <input
                type="range"
                min="0"
                max="100"
                value={sliderValue}
                onChange={(e) => setSliderValue(Number(e.target.value))}
                className="absolute top-0 left-0 w-full h-full cursor-ew-resize opacity-0"
                aria-label="Image comparison slider"
            />
        </div>
    );
};

export default ComparisonSlider;
