import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'tests/browser', timeout:45000, workers:1, reporter:'list',
  use:{baseURL:'http://127.0.0.1:8765',headless:true,viewport:{width:1400,height:1000}},
  webServer:{command:'python3 -m http.server 8765 --bind 127.0.0.1',url:'http://127.0.0.1:8765',reuseExistingServer:false,stdout:'ignore',stderr:'ignore'},
});
