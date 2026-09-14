import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests/browser',timeout:30000,workers:1,use:{viewport:{width:1440,height:1000},headless:true},reporter:'list'});
