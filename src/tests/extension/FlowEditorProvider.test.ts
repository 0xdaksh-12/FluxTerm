import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

suite('FlowEditorProvider Test Suite', () => {
    let testFileUri: vscode.Uri;
    
    suiteSetup(async () => {
        // Create a temporary .flow file
        const tempPath = path.join(os.tmpdir(), `test-${Date.now()}.flow`);
        fs.writeFileSync(tempPath, JSON.stringify({ blocks: [] }));
        testFileUri = vscode.Uri.file(tempPath);
    });

    suiteTeardown(async () => {
        // Cleanup remaining files
        if (fs.existsSync(testFileUri.fsPath)) {
            fs.unlinkSync(testFileUri.fsPath);
        }
    });

    test('Should register flow.editor custom editor and open document', async () => {
        // Ensure extension is activated
        const ext = vscode.extensions.getExtension('undefined_publisher.flow'); // Default publisher if not specified in package.json
        if (ext && !ext.isActive) {
            await ext.activate();
        }

        // Try opening the custom editor
        await vscode.commands.executeCommand('vscode.openWith', testFileUri, 'flow.editor');
        
        // Give it a moment to resolve
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Assert that the active tab is our webview
        const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
        assert.ok(activeTab, 'There should be an active tab');
        
        const isCustomEditor = activeTab.input instanceof vscode.TabInputCustom;
        assert.ok(isCustomEditor, 'Active tab should be a custom editor');
        
        if (activeTab.input instanceof vscode.TabInputCustom) {
            assert.strictEqual(activeTab.input.viewType, 'flow.editor');
            assert.strictEqual(activeTab.input.uri.fsPath, testFileUri.fsPath);
        }

        // Close the tab to clean up
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
});
