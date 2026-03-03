import * as vscode from 'vscode';

let chaosInterval: NodeJS.Timeout | undefined;
let flashbangInterval: NodeJS.Timeout | undefined;
let isThemerActive = false;
let isFlashbangActive = false;

interface ThemeInfo {
    label: string;
    id: string;
}

let _restoreOriginalTheme: (() => Promise<void>) | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('Themer is now armed and dangerous! :D');

    // Capture original theme on every activate, but only if chaos isn't currently running.
    // This ensures manual theme changes between sessions are respected.
    const currentTheme = vscode.workspace.getConfiguration().get<string>('workbench.colorTheme');
    if (currentTheme && !isThemerActive && !isFlashbangActive) {
        context.globalState.update('themer.originalTheme', currentTheme);
    }

    // Restores original theme. Never clears it from state so it survives multiple sessions.
    async function restoreOriginalTheme() {
        const original = context.globalState.get<string>('themer.originalTheme');
        if (original) {
            await vscode.workspace.getConfiguration().update(
                'workbench.colorTheme',
                original,
                vscode.ConfigurationTarget.Global
            );
        }
    }
    _restoreOriginalTheme = restoreOriginalTheme;

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

        // Always snapshot the current theme right before chaos starts
        const themeBeforeChaos = vscode.workspace.getConfiguration().get<string>('workbench.colorTheme');
        if (themeBeforeChaos) {
            context.globalState.update('themer.originalTheme', themeBeforeChaos);
        }

        vscode.window.showInformationMessage(`>:) Chaos begins! Switching every ${interval}s`);

        chaosInterval = setInterval(async () => {
            // Re-read installed themes each tick to guard against deleted themes
            const installedThemes = await getAllThemes();
            const installedIds = new Set(installedThemes.map((t) => t.id));
            const validThemes = selectedThemeIds.filter((id) => installedIds.has(id));

            if (validThemes.length === 0) {
                clearInterval(chaosInterval);
                chaosInterval = undefined;
                isThemerActive = false;
                vscode.window.showWarningMessage(':/ All selected themes were removed! Chaos stopped.');
                return;
            }

            const themeId = isRandom
                ? validThemes[Math.floor(Math.random() * validThemes.length)]
                : validThemes[currentIndex % validThemes.length];

            vscode.workspace.getConfiguration().update(
                'workbench.colorTheme',
                themeId,
                vscode.ConfigurationTarget.Global
            );

            if (!isRandom) { currentIndex++; }
        }, interval * 1000);
    });

    // Command: Stop theme chaos
    let stopCmd = vscode.commands.registerCommand('themer.stopChaos', async () => {
        if (!isThemerActive) {
            vscode.window.showWarningMessage(':| Already calm. Nothing to stop!');
            return;
        }

        if (chaosInterval) {
            clearInterval(chaosInterval);
            chaosInterval = undefined;
        }
        isThemerActive = false;
        await restoreOriginalTheme();
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

        // Always snapshot the current theme right before flashbang starts
        const themeBeforeFlash = vscode.workspace.getConfiguration().get<string>('workbench.colorTheme');
        if (themeBeforeFlash) {
            context.globalState.update('themer.originalTheme', themeBeforeFlash);
        }

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
    let stopFlashbangCmd = vscode.commands.registerCommand('themer.stopFlashbang', async () => {
        if (!isFlashbangActive) {
            vscode.window.showWarningMessage(':| No flashbang to stop!');
            return;
        }

        if (flashbangInterval) {
            clearInterval(flashbangInterval);
            flashbangInterval = undefined;
        }
        isFlashbangActive = false;
        await restoreOriginalTheme();
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

        // Stop chaos if panel is closed
        panel.onDidDispose(async () => {
            if (chaosInterval) {
                clearInterval(chaosInterval);
                chaosInterval = undefined;
                isThemerActive = false;
            }
            if (flashbangInterval) {
                clearInterval(flashbangInterval);
                flashbangInterval = undefined;
                isFlashbangActive = false;
            }
            await restoreOriginalTheme();
        }, null, context.subscriptions);

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
            randomMode,
            isThemerActive,
            isFlashbangActive
        });

        // Auto-refresh theme list when user installs or removes a theme extension
        const extChangeDisposable = vscode.extensions.onDidChange(async () => {
            if (panel.visible) {
                const updatedThemes = await getAllThemes();
                const cfg2 = vscode.workspace.getConfiguration('themer');
                panel.webview.postMessage({
                    command: 'themesData',
                    allThemes: updatedThemes,
                    selectedIds: cfg2.get<string[]>('selectedThemes') || [],
                    interval: cfg2.get<number>('interval') || 5,
                    randomMode: cfg2.get<boolean>('randomMode') || false,
                    isThemerActive,
                    isFlashbangActive
                });
            }
        });
        context.subscriptions.push(extChangeDisposable);

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
                            randomMode: currentRandomMode,
                            isThemerActive,
                            isFlashbangActive
                        });
                        break;
                    case 'saveConfig':
                        const cfg = vscode.workspace.getConfiguration('themer');
                        await cfg.update('selectedThemes', message.themeIds, vscode.ConfigurationTarget.Global);
                        await cfg.update('interval', message.interval, vscode.ConfigurationTarget.Global);
                        await cfg.update('randomMode', message.randomMode, vscode.ConfigurationTarget.Global);
                        vscode.window.showInformationMessage('(^_^) Configuration saved!');
                        break;
                    case 'startChaos':
                        await vscode.commands.executeCommand('themer.startChaos');
                        panel.webview.postMessage({ command: 'statusUpdate', isThemerActive, isFlashbangActive });
                        break;
                    case 'stopChaos':
                        await vscode.commands.executeCommand('themer.stopChaos');
                        panel.webview.postMessage({ command: 'statusUpdate', isThemerActive, isFlashbangActive });
                        break;
                    case 'flashbang':
                        await vscode.commands.executeCommand('themer.flashbang');
                        panel.webview.postMessage({ command: 'statusUpdate', isThemerActive, isFlashbangActive });
                        break;
                    case 'stopFlashbang':
                        await vscode.commands.executeCommand('themer.stopFlashbang');
                        panel.webview.postMessage({ command: 'statusUpdate', isThemerActive, isFlashbangActive });
                        break;
                    case 'restoreTheme':
                        await restoreOriginalTheme();
                        vscode.window.showInformationMessage('(~_~) Original theme restored!');
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
            .controls-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
                margin-bottom: 10px;
            }
            .btn-chaos {
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none; padding: 10px; cursor: pointer; border-radius: 3px; font-size: 14px;
            }
            .btn-chaos:hover { background: var(--vscode-button-hoverBackground); }
            .btn-stop {
                background: var(--vscode-inputValidation-warningBackground, #6b3a00);
                color: var(--vscode-button-foreground);
                border: none; padding: 10px; cursor: pointer; border-radius: 3px; font-size: 14px;
            }
            .btn-stop:hover { opacity: 0.85; }
            .btn-flash {
                background: var(--vscode-inputValidation-errorBackground, #5a0000);
                color: var(--vscode-button-foreground);
                border: none; padding: 10px; cursor: pointer; border-radius: 3px; font-size: 14px;
            }
            .btn-flash:hover { opacity: 0.85; }
            .btn-restore {
                background: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
                border: none; padding: 10px 20px; cursor: pointer; border-radius: 3px; font-size: 14px;
            }
            .btn-restore:hover { background: var(--vscode-button-secondaryHoverBackground); }
            .status-line {
                margin-top: 8px;
                font-size: 13px;
                opacity: 0.8;
            }
            .status-active { color: #4ec94e; }
            .status-flash { color: #e06c6c; }
            .badge {
                font-size: 12px;
                background: var(--vscode-badge-background);
                color: var(--vscode-badge-foreground);
                padding: 2px 8px;
                border-radius: 10px;
                margin-left: 8px;
                vertical-align: middle;
            }
            #themeSearch {
                width: 100%;
                padding: 6px 10px;
                margin-bottom: 8px;
                background: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border: 1px solid var(--vscode-input-border);
                border-radius: 3px;
                font-size: 13px;
                box-sizing: border-box;
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
            <h2>B-) Select Your Themes <span id="selectedCount" class="badge">0 selected</span></h2>
            <input type="text" id="themeSearch" placeholder="(o_o) Search themes..." oninput="filterThemes()" />
            <p>Click themes to add/remove from rotation</p>
            <div id="themeList" class="theme-list">
                Loading themes...
            </div>
        </div>

        <button onclick="saveConfig()">(+) Save Configuration</button>
        <button onclick="selectAll()">:) Select All</button>
        <button onclick="clearAll()">:( Clear All</button>
        <button onclick="refreshThemes()">(@_@) Refresh Themes</button>

        <div class="section">
            <h2>>:) Chaos Controls</h2>
            <div class="controls-grid">
                <button class="btn-chaos" onclick="sendCmd('startChaos')">:D Let the Chaos Begin!</button>
                <button class="btn-stop" onclick="sendCmd('stopChaos')">:) Restore Sanity</button>
                <button class="btn-flash" onclick="sendCmd('flashbang')">(*_*) FLASHBANG MODE!</button>
                <button class="btn-stop" onclick="sendCmd('stopFlashbang')">(^_^) Stop Flashbang</button>
            </div>
            <div id="statusLine" class="status-line">(-_-) Idle</div>
        </div>

        <div class="section">
            <h2>(~_~) Restore Original Theme</h2>
            <p>Brings back the theme you had before opening Themer</p>
            <button class="btn-restore" onclick="sendCmd('restoreTheme')">(~_~) Restore My Theme</button>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            let allThemes = [];
            let selectedThemeIds = [];
            let filterText = '';

            vscode.postMessage({ command: 'getThemes' });

            window.addEventListener('message', event => {
                const message = event.data;
                if (message.command === 'themesData') {
                    allThemes = message.allThemes;
                    selectedThemeIds = message.selectedIds;
                    document.getElementById('intervalSlider').value = message.interval;
                    document.getElementById('intervalValue').textContent = message.interval + 's';
                    const modeRadio = message.randomMode ? 'random' : 'sequential';
                    document.querySelector(\`input[value="\${modeRadio}"]\`).checked = true;
                    updateStatus(message.isThemerActive, message.isFlashbangActive);
                    renderThemes();
                }
                if (message.command === 'statusUpdate') {
                    updateStatus(message.isThemerActive, message.isFlashbangActive);
                }
            });

            function updateStatus(isActive, isFlash) {
                const el = document.getElementById('statusLine');
                if (isFlash) {
                    el.textContent = '(*_*) FLASHBANG ACTIVE!';
                    el.className = 'status-line status-flash';
                } else if (isActive) {
                    el.textContent = '>:) Chaos is running!';
                    el.className = 'status-line status-active';
                } else {
                    el.textContent = '(-_-) Idle';
                    el.className = 'status-line';
                }
            }

            function sendCmd(cmd) {
                vscode.postMessage({ command: cmd });
            }

            document.getElementById('intervalSlider').addEventListener('input', (e) => {
                document.getElementById('intervalValue').textContent = e.target.value + 's';
            });

            function filterThemes() {
                filterText = document.getElementById('themeSearch').value.toLowerCase();
                renderThemes();
            }

            function renderThemes() {
                const list = document.getElementById('themeList');
                const filtered = allThemes.filter(t => t.label.toLowerCase().includes(filterText));
                list.innerHTML = filtered.map(theme => {
                    const isSelected = selectedThemeIds.includes(theme.id);
                    return \`
                        <div class="theme-item \${isSelected ? 'selected' : ''}" onclick="toggleTheme('\${escapeId(theme.id)}')">
                            <input type="checkbox" class="checkbox" \${isSelected ? 'checked' : ''} onclick="event.stopPropagation()">
                            <span>\${escapeHtml(theme.label)}</span>
                        </div>
                    \`;
                }).join('');
                document.getElementById('selectedCount').textContent = selectedThemeIds.length + ' selected';
            }

            function escapeHtml(text) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            }

            function escapeId(text) {
                return text.replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'");
            }

            function toggleTheme(themeId) {
                const index = selectedThemeIds.indexOf(themeId);
                if (index > -1) { selectedThemeIds.splice(index, 1); }
                else { selectedThemeIds.push(themeId); }
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
                vscode.postMessage({ command: 'saveConfig', themeIds: selectedThemeIds, interval, randomMode });
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
    if (_restoreOriginalTheme) {
        _restoreOriginalTheme();
    }
}
