import * as vscode from 'vscode';

let chaosInterval: NodeJS.Timeout | undefined;
let flashbangInterval: NodeJS.Timeout | undefined;
let isThemerActive = false;
let isFlashbangActive = false;

interface ThemeInfo {
    label: string;
    id: string;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Themer is now armed and dangerous! :D');

    // Command: Start theme chaos
    let startCmd = vscode.commands.registerCommand('themer.startChaos', async () => {
        if (isThemerActive) {
            vscode.window.showWarningMessage('(!) Chaos is already unleashed!');
            return;
        }

        const config = vscode.workspace.getConfiguration('themer');
        const selectedThemeIds = config.get<string[]>('selectedThemes') || [];
        
        if (selectedThemeIds.length === 0) {
            vscode.window.showErrorMessage(':/ No themes selected! Use "Themer: Configure Madness" first.');
            return;
        }

        const interval = config.get<number>('interval') || 5;
        const isRandom = config.get<boolean>('randomMode') || false;

        isThemerActive = true;
        let currentIndex = 0;

        vscode.window.showInformationMessage(`>:) Chaos begins! Switching every ${interval}s`);

        chaosInterval = setInterval(() => {
            const themeId = isRandom 
                ? selectedThemeIds[Math.floor(Math.random() * selectedThemeIds.length)]
                : selectedThemeIds[currentIndex % selectedThemeIds.length];
            
            vscode.workspace.getConfiguration().update(
                'workbench.colorTheme',
                themeId,
                vscode.ConfigurationTarget.Global
            );

            if (!isRandom) {
                currentIndex++;
            }
        }, interval * 1000);
    });

    // Command: Stop theme chaos
    let stopCmd = vscode.commands.registerCommand('themer.stopChaos', () => {
        if (!isThemerActive) {
            vscode.window.showWarningMessage(':| Already calm. Nothing to stop!');
            return;
        }

        if (chaosInterval) {
            clearInterval(chaosInterval);
            chaosInterval = undefined;
        }
        isThemerActive = false;
        vscode.window.showInformationMessage(':) Sanity restored. Peace at last.');
    });

    // Command: Flashbang mode
    let flashbangCmd = vscode.commands.registerCommand('themer.flashbang', async () => {
        if (isFlashbangActive) {
            vscode.window.showWarningMessage('(*_*) Flashbang already active!');
            return;
        }

        const config = vscode.workspace.getConfiguration('themer');
        const selectedThemeIds = config.get<string[]>('selectedThemes') || [];
        
        if (selectedThemeIds.length === 0) {
            vscode.window.showErrorMessage(':/ No themes selected! Configure first.');
            return;
        }

        isFlashbangActive = true;
        let themeIndex = 0;

        vscode.window.showInformationMessage('(*_*) FLASHBANG MODE ACTIVATED! (*_*)');

        // Use a light theme ID for flashbang effect
        const flashTheme = 'Default Light Modern';

        flashbangInterval = setInterval(async () => {
            // Flash white
            await vscode.workspace.getConfiguration().update(
                'workbench.colorTheme',
                flashTheme,
                vscode.ConfigurationTarget.Global
            );

            // Wait 200ms then switch to next theme
            setTimeout(() => {
                const nextThemeId = selectedThemeIds[themeIndex % selectedThemeIds.length];
                vscode.workspace.getConfiguration().update(
                    'workbench.colorTheme',
                    nextThemeId,
                    vscode.ConfigurationTarget.Global
                );
                themeIndex++;
            }, 200);
        }, 3000);
    });

    // Command: Stop flashbang
    let stopFlashbangCmd = vscode.commands.registerCommand('themer.stopFlashbang', () => {
        if (!isFlashbangActive) {
            vscode.window.showWarningMessage(':| No flashbang to stop!');
            return;
        }

        if (flashbangInterval) {
            clearInterval(flashbangInterval);
            flashbangInterval = undefined;
        }
        isFlashbangActive = false;
        vscode.window.showInformationMessage('(^_^) Your retinas are safe now.');
    });

    // Command: Open configuration UI
    let configCmd = vscode.commands.registerCommand('themer.configure', async () => {
        const panel = vscode.window.createWebviewPanel(
            'themerConfig',
            ':D Configure Your Madness',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        panel.webview.html = getWebviewContent(context);

        // Send initial data immediately after panel is created
        const allThemes = await getAllThemes();
        const config = vscode.workspace.getConfiguration('themer');
        const selectedIds = config.get<string[]>('selectedThemes') || [];
        const interval = config.get<number>('interval') || 5;
        const randomMode = config.get<boolean>('randomMode') || false;
        
        panel.webview.postMessage({
            command: 'themesData',
            allThemes,
            selectedIds,
            interval,
            randomMode
        });

        // Handle messages from webview
        panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'getThemes':
                        // Refresh themes list (in case user installed new themes)
                        const refreshedThemes = await getAllThemes();
                        const currentConfig = vscode.workspace.getConfiguration('themer');
                        const currentSelectedIds = currentConfig.get<string[]>('selectedThemes') || [];
                        const currentInterval = currentConfig.get<number>('interval') || 5;
                        const currentRandomMode = currentConfig.get<boolean>('randomMode') || false;
                        
                        panel.webview.postMessage({
                            command: 'themesData',
                            allThemes: refreshedThemes,
                            selectedIds: currentSelectedIds,
                            interval: currentInterval,
                            randomMode: currentRandomMode
                        });
                        break;
                    case 'saveConfig':
                        const cfg = vscode.workspace.getConfiguration('themer');
                        await cfg.update('selectedThemes', message.themeIds, vscode.ConfigurationTarget.Global);
                        await cfg.update('interval', message.interval, vscode.ConfigurationTarget.Global);
                        await cfg.update('randomMode', message.randomMode, vscode.ConfigurationTarget.Global);
                        vscode.window.showInformationMessage('(^_^) Configuration saved!');
                        break;
                }
            },
            undefined,
            context.subscriptions
        );
    });

    context.subscriptions.push(startCmd, stopCmd, flashbangCmd, stopFlashbangCmd, configCmd);
}

async function getAllThemes(): Promise<ThemeInfo[]> {
    const extensions = vscode.extensions.all;
    const themes: ThemeInfo[] = [];
    const seenIds = new Set<string>();

    for (const ext of extensions) {
        const packageJSON = ext.packageJSON;
        if (packageJSON.contributes && packageJSON.contributes.themes) {
            for (const theme of packageJSON.contributes.themes) {
                // Get the theme ID (this is what VSCode actually uses)
                const themeId = theme.id || theme.label;
                // Get the display label
                const themeLabel = theme.label || theme.id || 'Unknown Theme';
                
                if (themeId && !seenIds.has(themeId)) {
                    seenIds.add(themeId);
                    themes.push({
                        label: themeLabel,
                        id: themeId
                    });
                }
            }
        }
    }

    return themes.sort((a, b) => a.label.localeCompare(b.label));
}

function getWebviewContent(context: vscode.ExtensionContext): string {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Themer Config</title>
        <style>
            body {
                padding: 20px;
                font-family: var(--vscode-font-family);
                color: var(--vscode-foreground);
            }
            h1 { color: var(--vscode-textLink-foreground); }
            .section {
                margin: 20px 0;
                padding: 15px;
                background: var(--vscode-editor-background);
                border-radius: 5px;
            }
            .slider-container {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            input[type="range"] {
                flex: 1;
                height: 8px;
            }
            .theme-list {
                max-height: 300px;
                overflow-y: auto;
                border: 1px solid var(--vscode-input-border);
                padding: 10px;
                border-radius: 5px;
            }
            .theme-item {
                padding: 8px;
                margin: 5px 0;
                cursor: pointer;
                border-radius: 3px;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .theme-item:hover {
                background: var(--vscode-list-hoverBackground);
            }
            .theme-item.selected {
                background: var(--vscode-list-activeSelectionBackground);
                color: var(--vscode-list-activeSelectionForeground);
            }
            button {
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 10px 20px;
                cursor: pointer;
                border-radius: 3px;
                font-size: 14px;
                margin: 5px;
            }
            button:hover {
                background: var(--vscode-button-hoverBackground);
            }
            .checkbox {
                width: 18px;
                height: 18px;
            }
            .mode-toggle {
                display: flex;
                gap: 10px;
                margin: 10px 0;
            }
        </style>
    </head>
    <body>
        <h1>:D Configure Your Madness</h1>
        
        <div class="section">
            <h2>(o_o) Chaos Interval</h2>
            <div class="slider-container">
                <input type="range" id="intervalSlider" min="1" max="60" value="5">
                <span id="intervalValue">5s</span>
            </div>
        </div>

        <div class="section">
            <h2>:? Mode Selection</h2>
            <div class="mode-toggle">
                <label>
                    <input type="radio" name="mode" value="sequential" checked> 
                    Sequential (in order)
                </label>
                <label>
                    <input type="radio" name="mode" value="random"> 
                    Random (chaotic)
                </label>
            </div>
        </div>

        <div class="section">
            <h2>B-) Select Your Themes</h2>
            <p>Click themes to add/remove from rotation</p>
            <div id="themeList" class="theme-list">
                Loading themes...
            </div>
        </div>

        <button onclick="saveConfig()">(+) Save Configuration</button>
        <button onclick="selectAll()">:) Select All</button>
        <button onclick="clearAll()">:( Clear All</button>
        <button onclick="refreshThemes()">(@_@) Refresh Themes</button>

        <script>
            const vscode = acquireVsCodeApi();
            let allThemes = []; // Array of {label, id}
            let selectedThemeIds = [];

            // Request themes on load
            vscode.postMessage({ command: 'getThemes' });

            // Listen for messages from extension
            window.addEventListener('message', event => {
                const message = event.data;
                if (message.command === 'themesData') {
                    allThemes = message.allThemes;
                    selectedThemeIds = message.selectedIds;
                    document.getElementById('intervalSlider').value = message.interval;
                    document.getElementById('intervalValue').textContent = message.interval + 's';
                    
                    const modeRadio = message.randomMode ? 'random' : 'sequential';
                    document.querySelector(\`input[value="\${modeRadio}"]\`).checked = true;
                    
                    renderThemes();
                }
            });

            document.getElementById('intervalSlider').addEventListener('input', (e) => {
                document.getElementById('intervalValue').textContent = e.target.value + 's';
            });

            function renderThemes() {
                const list = document.getElementById('themeList');
                list.innerHTML = allThemes.map(theme => {
                    const isSelected = selectedThemeIds.includes(theme.id);
                    return \`
                        <div class="theme-item \${isSelected ? 'selected' : ''}" onclick="toggleTheme('\${escapeHtml(theme.id)}')">
                            <input type="checkbox" class="checkbox" \${isSelected ? 'checked' : ''} onclick="event.stopPropagation()">
                            <span>\${escapeHtml(theme.label)}</span>
                        </div>
                    \`;
                }).join('');
            }

            function escapeHtml(text) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            }

            function toggleTheme(themeId) {
                const index = selectedThemeIds.indexOf(themeId);
                if (index > -1) {
                    selectedThemeIds.splice(index, 1);
                } else {
                    selectedThemeIds.push(themeId);
                }
                renderThemes();
            }

            function selectAll() {
                selectedThemeIds = allThemes.map(t => t.id);
                renderThemes();
            }

            function clearAll() {
                selectedThemeIds = [];
                renderThemes();
            }

            function refreshThemes() {
                vscode.postMessage({ command: 'getThemes' });
            }

            function saveConfig() {
                const interval = parseInt(document.getElementById('intervalSlider').value);
                const randomMode = document.querySelector('input[name="mode"]:checked').value === 'random';
                
                vscode.postMessage({
                    command: 'saveConfig',
                    themeIds: selectedThemeIds,
                    interval: interval,
                    randomMode: randomMode
                });
            }
        </script>
    </body>
    </html>`;
}

export function deactivate() {
    if (chaosInterval) {
        clearInterval(chaosInterval);
    }
    if (flashbangInterval) {
        clearInterval(flashbangInterval);
    }
}