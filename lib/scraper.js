import puppeteer from 'puppeteer';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

class InstagramDMScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.isRunning = false;
    this.lastMessageCount = 0;
    this.lastFirstDmContent = '';
    this.retryCount = 0;
    this.maxRetries = 5;
    this.scanInterval = 5000; // 5 seconds between scans
    this.conversationScrollCount = 15; // Number of messages to scroll through
    this.isInitialized = false; // Prevent multiple initializations
  }

  /**
   * Initialize Puppeteer browser and page with session handling
   */
  async initialize() {
    if (this.isInitialized) {
      console.log('✅ Already initialized, skipping...');
      return;
    }

    try {
      console.log('🚀 Initializing Puppeteer browser...');
      
      this.browser = await puppeteer.launch({
        headless: false, // Set to true in production
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor'
        ],
        defaultViewport: { width: 1280, height: 720 }
      });

      this.page = await this.browser.newPage();
      
      // Set user agent to avoid detection
      await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Disable console logging from page to reduce noise
      this.page.on('console', (msg) => {
        // Only log important messages, filter out permissions-policy errors
        const text = msg.text();
        if (text.includes('error') || text.includes('Error') || text.includes('replied to an ad')) {
          // Filter out permissions-policy errors
          if (!text.includes('Permissions-Policy header') && !text.includes('Origin trial controlled feature')) {
            console.log('📄 Page:', text);
          }
        }
      });
      
      // Listen to page errors
      this.page.on('pageerror', (error) => {
        console.error('❌ Page Error:', error.message);
      });
      
      // Inject session cookies
      await this.injectSessionCookies();
      
      this.isInitialized = true;
      console.log('✅ Puppeteer initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Puppeteer:', error);
      throw error;
    }
  }

  /**
   * Inject Instagram session cookies for authentication
   */
  async injectSessionCookies() {
    try {
      console.log('🍪 Injecting session cookies...');
      
      const sessionId = process.env.SESSIONID;
      if (!sessionId) {
        throw new Error('SESSIONID environment variable is not set');
      }

      // Set the session cookie for Instagram
      await this.page.setCookie({
        name: 'sessionid',
        value: sessionId,
        domain: '.instagram.com',
        path: '/',
        secure: true,
        httpOnly: true
      });

      console.log('✅ Session cookies injected successfully');
    } catch (error) {
      console.error('❌ Failed to inject session cookies:', error);
      throw error;
    }
  }

  /**
   * Start the DM scanning process
   */
  async startScraping() {
    if (this.isRunning) {
      console.log('⚠️ Scraper is already running');
      return;
    }

    try {
      console.log('🚀 Starting Instagram DM scraper...');
      await this.initialize();
      this.isRunning = true;

      // Navigate to Instagram DMs
      await this.navigateToDMs();
      
      // Start continuous monitoring
      await this.monitorDMs();
    } catch (error) {
      console.error('❌ Error starting scraper:', error);
      this.isRunning = false;
      
      // Auto-retry logic
      this.retryCount++;
      if (this.retryCount < this.maxRetries) {
        console.log(`🔄 Retrying in 30 seconds... (Attempt ${this.retryCount}/${this.maxRetries})`);
        setTimeout(() => this.startScraping(), 30000);
      } else {
        console.error('❌ Max retries reached. Scraper failed to start.');
      }
    }
  }

  /**
   * Navigate to Instagram Direct Messages
   */
  async navigateToDMs() {
    try {
      console.log('🧭 Navigating to Instagram DMs...');
      
      // Use TARGET_URL from environment or fallback to default
      const targetUrl = process.env.TARGET_URL || 'https://www.instagram.com/direct/inbox/';
      console.log(`📍 Navigating to: ${targetUrl}`);
      
      // Navigate to Instagram DMs
      await this.page.goto(targetUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Wait for the page to be fully loaded
      await this.page.waitForSelector('body', { timeout: 10000 });
      
      // Additional wait to ensure Instagram loads completely
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Verify we're on the correct page
      const currentUrl = await this.page.url();
      console.log('📍 Current URL:', currentUrl);
      
      if (!currentUrl.includes('instagram.com/direct')) {
        throw new Error('Failed to navigate to Instagram DMs');
      }

      console.log('✅ Successfully navigated to Instagram DMs');
    } catch (error) {
      console.error('❌ Error navigating to DMs:', error);
      throw error;
    }
  }

  /**
   * Main monitoring loop for detecting new DMs
   */
  async monitorDMs() {
    console.log('🔄 Starting DM monitoring loop...');
    
    while (this.isRunning) {
      try {
        // Ensure page is still valid
        if (!this.page || this.page.isClosed()) {
          console.log('❌ Page is closed, stopping scraper');
          break;
        }

        // Check for new DMs
        const newDm = await this.detectNewDM();
        
        if (newDm) {
          console.log('🎉 NEW DM DETECTED!');
          console.log(`👤 From: ${newDm.username}`);
          console.log(`💬 Message: ${newDm.message}`);
          
          // Update last known content
          this.lastFirstDmContent = newDm.content;
          
          // Open and scan the conversation
          await this.scanConversation(newDm);
          
          // Return to inbox
          await this.returnToInbox();
        }

        // Wait before next scan
        await new Promise(resolve => setTimeout(resolve, this.scanInterval));
      } catch (error) {
        console.error('❌ Error in monitoring loop:', error);
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds before retrying
      }
    }
  }

  /**
   * Detect if there's a new DM in the inbox
   */
  async detectNewDM() {
    try {
      const dmInfo = await this.page.evaluate(() => {
        // Look for DM containers using Instagram's structure
        const dmContainers = document.querySelectorAll('div[class*="x13dflua"][style*="opacity: 1"]');
        
        if (dmContainers.length === 0) {
          return null;
        }

        // Get the first (most recent) DM
        const firstContainer = dmContainers[0];
        const button = firstContainer.querySelector('div[role="button"]');
        
        if (!button) {
          return null;
        }

        // Extract username and message with multiple selector strategies
        let username = 'Unknown';
        let message = '';
        let time = '';
        
        // Try multiple selectors for username
        const usernameSelectors = [
          'span[class*="xlyipyv"]',
          'span[class*="x1lliihq"]',
          'span[class*="x1heor9g"]',
          'span[dir="auto"]',
          'h6 span',
          'div[role="button"] span'
        ];
        
        for (const selector of usernameSelectors) {
          const element = button.querySelector(selector);
          if (element && element.textContent.trim()) {
            username = element.textContent.trim();
            break;
          }
        }
        
        // Try multiple selectors for message
        const messageSelectors = [
          'span[class*="x1fhwpqd"]',
          'span[class*="x1lliihq"]',
          'span[class*="x1heor9g"]',
          'div[class*="x1n2onr6"] span',
          'span[dir="auto"]'
        ];
        
        for (const selector of messageSelectors) {
          const element = button.querySelector(selector);
          if (element && element.textContent.trim() && element.textContent.trim() !== username) {
            message = element.textContent.trim();
            break;
          }
        }
        
        // Get time
        const timeElement = button.querySelector('abbr[aria-label]');
        if (timeElement) {
          time = timeElement.getAttribute('aria-label');
        }
        
        const content = `${username}: ${message} (${time})`;
        
        return {
          username,
          message,
          time,
          content,
          container: true
        };
      });

      if (!dmInfo) {
        return null;
      }

      // Check if this is a new DM
      if (dmInfo.content !== this.lastFirstDmContent && this.lastFirstDmContent !== '') {
        console.log('🎉 DM CONTENT CHANGED!');
        return dmInfo;
      } else if (this.lastFirstDmContent === '') {
        console.log('🆕 First time checking - setting initial DM:', dmInfo.username);
        return dmInfo;
      }

      return null;
    } catch (error) {
      console.error('❌ Error detecting new DM:', error);
      return null;
    }
  }

  /**
   * Open a DM conversation and scan for ad reply messages
   */
  async scanConversation(dmInfo) {
    try {
      console.log(`🔍 Opening conversation with ${dmInfo.username}...`);
      
      // Click on the first DM to open conversation
      const clicked = await this.page.evaluate(() => {
        const dmContainers = document.querySelectorAll('div[class*="x13dflua"][style*="opacity: 1"]');
        if (dmContainers.length > 0) {
          const button = dmContainers[0].querySelector('div[role="button"]');
          if (button) {
            button.click();
            return true;
          }
        }
        return false;
      });

      if (!clicked) {
        console.log('❌ Failed to click on DM');
        return;
      }

      console.log('✅ Clicked on DM, waiting for conversation to load...');
      
      // Wait for conversation to load
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Verify we're in a conversation
      const isInConversation = await this.page.evaluate(() => {
        return window.location.href.includes('/direct/t/');
      });

      if (!isInConversation) {
        console.log('❌ Failed to load conversation');
        return;
      }

      console.log('✅ Conversation loaded successfully');
      
      // Scan for ad reply messages
      await this.scanForAdReplies();
      
      // Return to inbox
      await this.returnToInbox();
      
    } catch (error) {
      console.error('❌ Error scanning conversation:', error);
    }
  }

  /**
   * Scan conversation for ad reply messages
   */
  async scanForAdReplies() {
    try {
      console.log('🔍 Scanning conversation for ad reply messages...');
      
      // Debug: Log all text content in the conversation
      await this.debugConversationContent();
      
      // Scroll through messages to load more content
      await this.scrollThroughMessages();
      
      // Extract ad reply messages
      const adReplies = await this.extractAdReplyMessages();
      
      // Process found ad replies
      if (adReplies.length > 0) {
        console.log(`🎯 Found ${adReplies.length} ad reply message(s)`);
        await this.processAdReplies(adReplies);
      } else {
        console.log('📭 No ad reply messages found in this conversation');
      }
      
    } catch (error) {
      console.error('❌ Error scanning for ad replies:', error);
    }
  }

  /**
   * Debug function to log all text content in the conversation
   */
  async debugConversationContent() {
    try {
      console.log('🔍 Debug: Checking for ad reply messages...');
      
      const allText = await this.page.evaluate(() => {
        const textContent = document.body.textContent || '';
        
        // Look for any text containing "replied" and "ad"
        const repliedAdMatches = textContent.match(/[^.\n]*replied[^.\n]*ad[^.\n]*/gi);
        
        // Look for any text containing "View ad"
        const viewAdMatches = textContent.match(/[^.\n]*View ad[^.\n]*/gi);
        
        // Look for usernames (text that appears before "replied")
        const usernameMatches = textContent.match(/([A-Za-z0-9_\s\u00C0-\u017F\u1E00-\u1EFF\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF\u2C60-\u2C7F\uA720-\uA7FF\u00C0-\u00FF\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF\u2C60-\u2C7F\uA720-\uA7FF]+)\s+replied/gi);
        
        // Look for the exact pattern we're searching for
        const exactPatternMatches = textContent.match(/([A-Za-z0-9_\s\u00C0-\u017F\u1E00-\u1EFF\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF\u2C60-\u2C7F\uA720-\uA7FF\u00C0-\u00FF\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF\u2C60-\u2C7F\uA720-\uA7FF]+)\s+replied to an ad/gi);
        
        // NEW: Look for the specific pattern we're seeing in logs
        const specificPattern = textContent.match(/HARI__VISHNU__PODDAR__\s+replied to an ad/);
        const specificPatternWithHi = textContent.match(/HiEnterHARI__VISHNU__PODDAR__\s+replied to an ad/);
        
        return {
          containsAdReply: textContent.includes('replied to an ad'),
          containsViewAd: textContent.includes('View ad'),
          repliedAdMatches,
          viewAdMatches,
          usernameMatches,
          exactPatternMatches,
          totalTextLength: textContent.length,
          specificPattern: specificPattern ? specificPattern[0] : null,
          specificPatternWithHi: specificPatternWithHi ? specificPatternWithHi[0] : null
        };
      });
      
      if (allText.containsAdReply) {
        console.log('✅ Found "replied to an ad" in conversation text');
      } else {
        console.log('❌ "replied to an ad" not found in conversation text');
      }
      
      if (allText.containsViewAd) {
        console.log('✅ Found "View ad" in conversation text');
      } else {
        console.log('❌ "View ad" not found in conversation text');
      }
      
      if (allText.repliedAdMatches && allText.repliedAdMatches.length > 0) {
        console.log('🎯 Found replied + ad matches:', allText.repliedAdMatches.length);
        allText.repliedAdMatches.forEach(match => {
          console.log('  -', match.substring(0, 100));
        });
      }
      
      if (allText.exactPatternMatches && allText.exactPatternMatches.length > 0) {
        console.log('🎯 Found exact pattern matches:', allText.exactPatternMatches.length);
        allText.exactPatternMatches.forEach(match => {
          console.log('  -', match.substring(0, 100));
        });
      }
      
      if (allText.usernameMatches && allText.usernameMatches.length > 0) {
        console.log('👤 Found username matches:', allText.usernameMatches.length);
        allText.usernameMatches.forEach(match => {
          console.log('  -', match.substring(0, 50));
        });
      }
      
      // NEW: Log specific pattern matches
      if (allText.specificPattern) {
        console.log('🎯 Found specific pattern:', allText.specificPattern);
      }
      
      if (allText.specificPatternWithHi) {
        console.log('🎯 Found specific pattern with Hi:', allText.specificPatternWithHi);
      }
      
      console.log(`📊 Total text length: ${allText.totalTextLength} characters`);
      
    } catch (error) {
      console.error('❌ Error in debug function:', error);
    }
  }

  /**
   * Scroll through messages to load more content
   */
  async scrollThroughMessages() {
    try {
      console.log(`📜 Scrolling through ${this.conversationScrollCount} messages...`);
      
      for (let i = 0; i < this.conversationScrollCount; i++) {
        await this.page.evaluate(() => {
          const messageContainer = document.querySelector('div[role="main"]') || 
                                  document.querySelector('div[data-pagelet="IGDThreadList"]');
          if (messageContainer) {
            messageContainer.scrollTop = messageContainer.scrollTop - 100;
          }
        });
        
        // Small delay between scrolls
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      console.log('✅ Finished scrolling through messages');
    } catch (error) {
      console.error('❌ Error scrolling through messages:', error);
    }
  }

  /**
   * Extract ad reply messages from the conversation
   */
  async extractAdReplyMessages() {
    try {
      console.log('🔍 Extracting ad reply messages...');
      
      const adReplies = await this.page.evaluate(() => {
        const adReplyMessages = [];
        
        console.log('🔍 Starting ad reply extraction...');
        
        // Look for message containers with multiple selectors
        const messageSelectors = [
          'div[class*="x1n2onr6"][role="row"]',
          'div[class*="x1i10hfl"]',
          'div[class*="x1lliihq"]',
          'div[role="row"]',
          'div[class*="x1n2onr6"]',
          'div[class*="x1i10hfl"][role="button"]',
          'div[class*="x1lliihq"][role="button"]'
        ];
        
        let messageContainers = [];
        for (const selector of messageSelectors) {
          const containers = document.querySelectorAll(selector);
          if (containers.length > 0) {
            messageContainers = containers;
            console.log(`📊 Found ${containers.length} message containers with selector: ${selector}`);
            break;
          }
        }
        
        // If no containers found, try a broader search
        if (messageContainers.length === 0) {
          console.log('🔍 No message containers found, trying broader search...');
          messageContainers = document.querySelectorAll('div');
          console.log(`📊 Found ${messageContainers.length} total div elements`);
        }
        
        // Scan through each message container
        for (let i = 0; i < Math.min(messageContainers.length, 100); i++) {
          const container = messageContainers[i];
          const containerText = container.textContent || '';
          
          // Look for "replied to an ad" pattern
          if (containerText.includes('replied to an ad')) {
            console.log(`🎯 Found "replied to an ad" in container ${i}:`, containerText.substring(0, 100));
            
            // Use the new extractUsername function
            let username = 'Unknown';
            
            // Simple pattern to extract username
            const repliedPattern = /(.+?)\s+replied to an ad/;
            const match = containerText.match(repliedPattern);
            
            if (match && match[1]) {
              username = match[1].trim();
              
              // Clean up the username but preserve emojis and special characters
              username = username
                .replace(/Enter|Search|Clip|Audio call|Video call|Conversation|Active|ago|Active now/g, '')
                .replace(/[0-9]{1,2}:[0-9]{2}\s*(AM|PM)?/g, '')
                .replace(/Today at [0-9]{1,2}:[0-9]{2}\s*(AM|PM)?/g, '')
                .replace(/[0-9]{1,2}m\s*ago/g, '')
                .replace(/mr_black_label____/g, '')
                .replace(/\s+/g, ' ')
                .trim();
              
              // If username is too long or contains UI elements, try to extract just the name
              if (username.length > 50 || username.includes('Enter') || username.includes('Search')) {
                const nameMatch = username.match(/([A-Za-z\u00C0-\u017F\u1E00-\u1EFF\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF\u2C60-\u2C7F\uA720-\uA7FF\u00C0-\u00FF~]+(?:\s+[A-Za-z\u00C0-\u017F\u1E00-\u1EFF\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF\u2C60-\u2C7F\uA720-\uA7FF\u00C0-\u00FF~]+)*)/u);
                if (nameMatch && nameMatch[1]) {
                  username = nameMatch[1].trim();
                }
              }
              
              console.log(`👤 Extracted username: ${username}`);
            }
            
            // Look for "View ad" link with multiple strategies
            let adLink = null;
            const linkSelectors = [
              'a[href*="instagram.com/p/"]',
              'a[href*="instagram.com"]',
              'a[target="_blank"]',
              'a[aria-label*="View"]',
              'a[href*="/p/"]',
              'a'
            ];
            
            for (const selector of linkSelectors) {
              const links = container.querySelectorAll(selector);
              for (const link of links) {
                const href = link.href;
                if (href && (href.includes('instagram.com/p/') || href.includes('/p/'))) {
                  adLink = href;
                  console.log(`🔗 Found ad link: ${adLink} with selector: ${selector}`);
                  break;
                }
              }
              if (adLink) break;
            }
            
            // If no link found in elements, try to extract from text
            if (!adLink) {
              const linkMatch = containerText.match(/https:\/\/www\.instagram\.com\/p\/[A-Za-z0-9_-]+\//);
              if (linkMatch) {
                adLink = linkMatch[0];
                console.log(`🔗 Extracted ad link from text: ${adLink}`);
              }
            }
            
            // Create message content
            const messageContent = `${username} replied to an ad. View ad`;
            
            console.log(`✅ Extracted ad reply: ${messageContent}`);
            
            adReplyMessages.push({
              senderUsername: username,
              recipientUsername: 'Current User',
              content: messageContent,
              adLink: adLink
            });
          }
        }
        
        // Also search using TreeWalker for text nodes
        console.log('🔍 Searching for text nodes with "replied to an ad"...');
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );
        
        let node;
        while (node = walker.nextNode()) {
          const text = node.textContent || '';
          if (text.includes('replied to an ad')) {
            console.log('🎯 Found "replied to an ad" text node:', text);
            
            // Find parent element containing this text
            let parent = node.parentElement;
            let depth = 0;
            while (parent && parent !== document.body && depth < 10) {
              const parentText = parent.textContent || '';
              if (parentText.includes('replied to an ad')) {
                console.log('✅ Found complete ad reply in parent:', parentText.substring(0, 200));
                
                // Extract username using the same logic
                let username = 'Unknown';
                const repliedPattern = /(.+?)\s+replied to an ad/;
                const match = parentText.match(repliedPattern);
                
                if (match && match[1]) {
                  username = match[1].trim();
                  
                  // Clean up the username but preserve emojis and special characters
                  username = username
                    .replace(/Enter|Search|Clip|Audio call|Video call|Conversation|Active|ago|Active now/g, '')
                    .replace(/[0-9]{1,2}:[0-9]{2}\s*(AM|PM)?/g, '')
                    .replace(/Today at [0-9]{1,2}:[0-9]{2}\s*(AM|PM)?/g, '')
                    .replace(/[0-9]{1,2}m\s*ago/g, '')
                    .replace(/mr_black_label____/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();
                  
                  // If username is too long or contains UI elements, try to extract just the name
                  if (username.length > 50 || username.includes('Enter') || username.includes('Search')) {
                    const nameMatch = username.match(/([A-Za-z\u00C0-\u017F\u1E00-\u1EFF\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF\u2C60-\u2C7F\uA720-\uA7FF\u00C0-\u00FF~]+(?:\s+[A-Za-z\u00C0-\u017F\u1E00-\u1EFF\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF\u2C60-\u2C7F\uA720-\uA7FF\u00C0-\u00FF~]+)*)/u);
                    if (nameMatch && nameMatch[1]) {
                      username = nameMatch[1].trim();
                    }
                  }
                  
                  console.log(`👤 Extracted username in parent: ${username}`);
                }
                
                // Find the "View ad" link
                let adLink = null;
                const linkSelectors = [
                  'a[href*="instagram.com/p/"]',
                  'a[href*="instagram.com"]',
                  'a[target="_blank"]',
                  'a[aria-label*="View"]',
                  'a[href*="/p/"]',
                  'a'
                ];
                
                for (const selector of linkSelectors) {
                  const links = parent.querySelectorAll(selector);
                  for (const link of links) {
                    const href = link.href;
                    if (href && (href.includes('instagram.com/p/') || href.includes('/p/'))) {
                      adLink = href;
                      console.log(`🔗 Found ad link in parent: ${adLink} with selector: ${selector}`);
                      break;
                    }
                  }
                  if (adLink) break;
                }
                
                // Check if we already have this message
                const existingMessage = adReplyMessages.find(msg => 
                  msg.senderUsername === username && msg.content.includes('replied to an ad')
                );
                
                if (!existingMessage) {
                  adReplyMessages.push({
                    senderUsername: username,
                    recipientUsername: 'Current User',
                    content: `${username} replied to an ad. View ad`,
                    adLink: adLink
                  });
                  console.log(`✅ Added new ad reply message for: ${username}`);
                }
                
                break;
              }
              parent = parent.parentElement;
              depth++;
            }
          }
        }
        
        // Also search for any text containing the exact pattern
        console.log('🔍 Searching for exact pattern match...');
        const allText = document.body.textContent || '';
        
        // Try multiple patterns for finding ad reply messages with improved regex
        const patterns = [
          /([A-Za-z0-9_\u00C0-\u017F\u1E00-\u1EFF\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF\u2C60-\u2C7F\uA720-\uA7FF\u00C0-\u00FF\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF\u2C60-\u2C7F\uA720-\uA7FF]+)\s+replied to an ad\.\s*View ad/g,
          /([A-Za-z0-9_\u00C0-\u017F\u1E00-\u1EFF\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF\u2C60-\u2C7F\uA720-\uA7FF\u00C0-\u00FF\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF\u2C60-\u2C7F\uA720-\uA7FF]+)\s+replied to an ad/g,
          /([A-Za-z0-9_]+(?:_[A-Za-z0-9_]+)*)\s+replied to an ad/g,
          /([A-Za-z0-9_]+)\s+replied.*ad/g,
          /([A-Za-z0-9_]+)\s+replied/g
        ];
        
        let patternMatches = [];
        for (const pattern of patterns) {
          const matches = allText.match(pattern);
          if (matches) {
            console.log(`🎯 Found pattern matches with ${pattern}:`, matches);
            patternMatches = matches;
            break;
          }
        }
        
        if (patternMatches.length > 0) {
          patternMatches.forEach(match => {
            let username = 'Unknown';
            
            // Extract username from the match
            if (match.includes('replied to an ad')) {
              username = match.split(' replied to an ad')[0].trim();
            } else if (match.includes('replied')) {
              username = match.split(' replied')[0].trim();
            }
            
            // Clean up the username but preserve emojis and special characters
            username = username
              .replace(/Enter|Search|Clip|Audio call|Video call|Conversation|Active|ago|Active now/g, '')
              .replace(/[0-9]{1,2}:[0-9]{2}\s*(AM|PM)?/g, '')
              .replace(/Today at [0-9]{1,2}:[0-9]{2}\s*(AM|PM)?/g, '')
              .replace(/[0-9]{1,2}m\s*ago/g, '')
              .replace(/mr_black_label____/g, '')
              .replace(/\s+/g, ' ')
              .trim();
            
            // If username is too long or contains UI elements, try to extract just the name
            if (username.length > 50 || username.includes('Enter') || username.includes('Search')) {
              const nameMatch = username.match(/([A-Za-z\u00C0-\u017F\u1E00-\u1EFF\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF\u2C60-\u2C7F\uA720-\uA7FF\u00C0-\u00FF~]+(?:\s+[A-Za-z\u00C0-\u017F\u1E00-\u1EFF\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF\u2C60-\u2C7F\uA720-\uA7FF\u00C0-\u00FF~]+)*)/u);
              if (nameMatch && nameMatch[1]) {
                username = nameMatch[1].trim();
              }
            }
            
            // Check if we already have this message
            const existingMessage = adReplyMessages.find(msg => 
              msg.senderUsername === username && msg.content.includes('replied to an ad')
            );
            
            if (!existingMessage && username !== 'Unknown') {
              adReplyMessages.push({
                senderUsername: username,
                recipientUsername: 'Current User',
                content: `${username} replied to an ad. View ad`,
                adLink: null // Will be updated later if found
              });
              console.log(`✅ Added new ad reply message from pattern: ${username}`);
            }
          });
        }
        
        return adReplyMessages;
      });

      console.log(`📊 Extracted ${adReplies.length} ad reply messages`);
      
      // Log each found message
      adReplies.forEach((msg, index) => {
        console.log(`📝 Message ${index + 1}:`, {
          username: msg.senderUsername,
          content: msg.content,
          adLink: msg.adLink
        });
      });
      
      return adReplies;
    } catch (error) {
      console.error('❌ Error extracting ad reply messages:', error);
      return [];
    }
  }

  /**
   * Process and save ad reply messages
   */
  async processAdReplies(adReplies) {
    console.log(`🔍 Processing ${adReplies.length} ad reply messages...`);
    
    for (const message of adReplies) {
      try {
        console.log(`📝 Processing message: "${message.content.substring(0, 50)}..."`);
        
        // Validate message has required data
        if (message.content.includes('replied to an ad')) {
          console.log('✅ Valid ad reply message found!');
          console.log(`👤 Username: ${message.senderUsername}`);
          console.log(`🔗 Ad link: ${message.adLink}`);
          
          // Save to database (even if ad link is null, the API will handle it)
          await this.saveMessage(message);
          console.log('💾 Ad reply message processed successfully!');
        } else {
          console.log('❌ Invalid ad reply message');
        }
      } catch (error) {
        console.error('❌ Error processing ad reply message:', error);
      }
    }
  }

  /**
   * Save message to database via API
   */
  async saveMessage(messageData) {
    try {
      console.log('💾 Saving message to database...');
      
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/api/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          senderUsername: messageData.senderUsername,
          recipientUsername: messageData.recipientUsername,
          content: messageData.content,
          adData: {
            adLink: messageData.adLink,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to save message: ${response.statusText}`);
      }

      const savedMessage = await response.json();
      console.log('✅ Message saved with ID:', savedMessage._id);
      return savedMessage;
    } catch (error) {
      console.error('❌ Error saving message to API:', error);
      throw error;
    }
  }

  /**
   * Return to the inbox from conversation
   */
  async returnToInbox() {
    try {
      console.log('🔙 Returning to inbox...');
      
      // Try to find and click back button
      const returned = await this.page.evaluate(() => {
        const backSelectors = [
          'a[href*="/direct/"]',
          'button[aria-label*="Back"]',
          'button[aria-label*="Close"]',
          'div[role="button"]:contains("Back")'
        ];
        
        for (const selector of backSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            element.click();
            return true;
          }
        }
        
        // If no back button found, navigate to inbox URL
        if (window.location.href.includes('/direct/t/')) {
          window.location.href = '/direct/inbox/';
          return true;
        }
        
        return false;
      });
      
      if (returned) {
        console.log('✅ Successfully returned to inbox');
        // Wait for inbox to load
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.log('⚠️ Could not find back button, navigating directly');
        const targetUrl = process.env.TARGET_URL || 'https://www.instagram.com/direct/inbox/';
        await this.page.goto(targetUrl, {
          waitUntil: 'networkidle2',
          timeout: 30000
        });
      }
    } catch (error) {
      console.error('❌ Error returning to inbox:', error);
    }
  }

  /**
   * Stop the scraper
   */
  async stop() {
    console.log('🛑 Stopping Instagram DM scraper...');
    this.isRunning = false;
    
    if (this.browser) {
      await this.browser.close();
      console.log('✅ Browser closed');
    }
    
    this.isInitialized = false;
    console.log('🛑 Scraper stopped successfully');
  }

  /**
   * Get current scraper status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      retryCount: this.retryCount,
      lastFirstDmContent: this.lastFirstDmContent,
      scanInterval: this.scanInterval
    };
  }

  /**
   * Extract username from text more reliably
   */
  extractUsername(text) {
    if (!text) return 'Unknown';
    
    // Remove common Instagram UI elements and noise
    let cleanText = text
      .replace(/Enter|Search|Clip|Audio call|Video call|Conversation|Active|ago|Active now/g, '')
      .replace(/[0-9]{1,2}:[0-9]{2}\s*(AM|PM)?/g, '') // Remove time stamps
      .replace(/Today at [0-9]{1,2}:[0-9]{2}\s*(AM|PM)?/g, '') // Remove "Today at" timestamps
      .replace(/[0-9]{1,2}m\s*ago/g, '') // Remove "Xm ago"
      .replace(/mr_black_label____/g, '') // Remove Instagram UI elements
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    // Look for the pattern "Username replied to an ad"
    const repliedPattern = /(.+?)\s+replied to an ad/;
    const match = cleanText.match(repliedPattern);
    
    if (match && match[1]) {
      let username = match[1].trim();
      
      // Clean up the username but preserve emojis and special characters
      username = username
        .replace(/^[^\w\u00C0-\u017F\u1E00-\u1EFF\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF\u2C60-\u2C7F\uA720-\uA7FF\u00C0-\u00FF~]+/, '') // Remove leading non-letters but keep emojis
        .replace(/[^\w\u00C0-\u017F\u1E00-\u1EFF\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF\u2C60-\u2C7F\uA720-\uA7FF\u00C0-\u00FF\s~]+$/, '') // Remove trailing non-letters but keep emojis
        .trim();
      
      // If username is still too long or contains obvious UI elements, try to extract just the name
      if (username.length > 50 || username.includes('Enter') || username.includes('Search')) {
        // Try to find a more reasonable username by looking for common patterns
        const namePatterns = [
          /([A-Za-z\u00C0-\u017F\u1E00-\u1EFF\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF\u2C60-\u2C7F\uA720-\uA7FF\u00C0-\u00FF~]+(?:\s+[A-Za-z\u00C0-\u017F\u1E00-\u1EFF\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF\u2C60-\u2C7F\uA720-\uA7FF\u00C0-\u00FF~]+)*)/u,
          /([A-Za-z\u00C0-\u017F\u1E00-\u1EFF\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF\u2C60-\u2C7F\uA720-\uA7FF\u00C0-\u00FF~]+)/u,
        ];
        
        for (const pattern of namePatterns) {
          const nameMatch = username.match(pattern);
          if (nameMatch && nameMatch[1] && nameMatch[1].length > 1) {
            username = nameMatch[1].trim();
            break;
          }
        }
      }
      
      // Ensure username is not empty or too short
      if (username && username.length > 0 && username !== 'Unknown') {
        return username;
      }
    }
    
    return 'Unknown';
  }
}

// Create a singleton instance
const scraper = new InstagramDMScraper();

// Export the scraper instance and a start function
export { scraper as default };

// Export a function to start the scraper
export async function startScraper() {
  console.log('🚀 Starting Instagram DM scraper...');
  
  // Check if required environment variables are set
  if (!process.env.SESSIONID) {
    console.error('❌ Missing required environment variable: SESSIONID');
    console.log('Please set SESSIONID in your .env file');
    return;
  }
  
  try {
    await scraper.startScraping();
  } catch (error) {
    console.error('❌ Failed to start scraper:', error);
  }
}

// Handle server shutdown gracefully
process.on('SIGINT', async () => {
  console.log('🛑 Server shutting down, stopping scraper...');
  await scraper.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Server terminating, stopping scraper...');
  await scraper.stop();
  process.exit(0);
});
