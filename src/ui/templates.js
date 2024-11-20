export const gameOverTemplate = `
    <div id="gameOverScreen" style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.9);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: white;
        font-family: Arial, sans-serif;
        z-index: 9999;
        pointer-events: auto;
    ">
        <h1 style="
            font-size: 72px;
            margin-bottom: 30px;
            color: #ff0000;
            text-shadow: 0 0 10px rgba(255, 0, 0, 0.5);
        ">GAME OVER</h1>
        <button id="restartButton" style="
            padding: 20px 40px;
            font-size: 32px;
            background-color: #4CAF50;
            color: white;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.3s;
            box-shadow: 0 0 20px rgba(76, 175, 80, 0.5);
        ">Restart Game</button>
    </div>
`;

export const volumeControlTemplate = `
    <div id="volumeControl" style="
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: rgba(0, 0, 0, 0.7);
        padding: 10px;
        border-radius: 5px;
        display: flex;
        align-items: center;
        gap: 10px;
        z-index: 1000;
    ">
        <button id="muteButton" style="
            background: none;
            border: none;
            color: white;
            cursor: pointer;
            font-size: 20px;
            padding: 5px;
        ">🔊</button>
        <input type="range" id="volumeSlider" min="0" max="100" value="100" style="
            width: 100px;
            cursor: pointer;
        ">
    </div>
`;
