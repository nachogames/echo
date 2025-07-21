# Settings UI Test Plan

## Test the new Settings functionality:

1. **Settings Button Display**
   - [ ] The settings button (⚙️) appears in the toolbar after the Dashboard button
   - [ ] The button has a hover state matching other buttons

2. **Settings Modal**
   - [ ] Clicking the settings button opens the modal
   - [ ] The modal has a dark overlay background
   - [ ] The modal is centered on screen
   - [ ] The checkbox correctly shows the current state of clearOnReload

3. **Save Settings**
   - [ ] Clicking Save updates the clearOnReload variable
   - [ ] The setting is persisted to localStorage
   - [ ] A success toast message appears
   - [ ] The modal closes

4. **Cancel Settings**
   - [ ] Clicking Cancel closes the modal without saving
   - [ ] No changes are made to the clearOnReload setting

5. **Clear on Reload Feature**
   - [ ] When enabled (default), requests are cleared on page reload
   - [ ] When disabled, requests persist across page reloads
   - [ ] The setting persists when DevTools is closed and reopened

## Implementation Summary

The implementation adds:
- A settings button in the toolbar
- A modal dialog for settings
- Checkbox to toggle "Clear requests on page reload"
- LocalStorage persistence for the setting
- Toast notifications for user feedback

The clearOnReload variable was already defined in the code (line 10) with localStorage support, so we just added the UI to control it.