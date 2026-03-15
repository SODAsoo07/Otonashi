const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  send: (channel, data) => {
    const validChannels = ['toMain'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  receive: (channel, handler) => {
    const validChannels = ['fromMain'];
    if (validChannels.includes(channel) && typeof handler === 'function') {
      ipcRenderer.on(channel, (_event, ...args) => handler(...args));
    }
  },
});

