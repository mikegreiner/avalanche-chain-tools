# Blackhole DEX Pool Recommender - Implementation Summary

## What Was Done

I've created a comprehensive Python script that extracts pool data from https://blackhole.xyz/vote and recommends the most profitable pools based on:
- **Total Rewards** (primary, 70% weight)
- **VAPR** (secondary, 30% weight)

## Files Created

1. **blackhole_pool_recommender.py** - Main script with multiple extraction methods
2. **inspect_blackhole_page.py** - Helper script to analyze page structure
3. **find_api_endpoint.py** - Script to find API endpoints (requires Selenium)
4. **extract_urls.py** - Helper to extract URLs from JavaScript bundle
5. **README_pool_recommender.md** - Documentation

## Extraction Methods

The script tries multiple methods to extract pool data:

1. **DOM Element Extraction** - Uses Selenium to find pool elements by XPath
2. **Text-Based Extraction** - Parses rendered page text for patterns
3. **HTML Parsing** - Uses BeautifulSoup to parse HTML structure
4. **JSON Extraction** - Looks for embedded JSON data in the page
5. **API Endpoint** - Attempts to find direct API endpoints (fallback)

## Installation

```bash
pip install -r requirements.txt
```

**Important:** You'll also need ChromeDriver:
- Linux: `sudo apt-get install chromium-chromedriver` or download from https://chromedriver.chromium.org/
- macOS: `brew install chromedriver`
- Windows: Download from https://chromedriver.chromium.org/

## Testing

### Step 1: Test the page inspection tool
```bash
python3 inspect_blackhole_page.py
```
This will open the page in a browser and analyze its structure. Check the saved HTML file to see the actual structure.

### Step 2: Run the main script
```bash
# Run in headless mode (default)
python3 blackhole_pool_recommender.py --top 5

# Run with visible browser (for debugging)
python3 blackhole_pool_recommender.py --top 5 --no-headless
```

## Customization Needed

Since the page structure is dynamic, you may need to adjust the selectors. The script includes multiple fallback methods, but you can improve it by:

1. **Finding the correct selectors:**
   - Run `scripts/inspect_blackhole_page.py` to see the page structure
   - Use browser DevTools (F12) to inspect the rendered HTML
   - Look for CSS classes or data attributes used for pools

2. **Identifying the API endpoint:**
   - Open https://blackhole.xyz/vote in your browser
   - Press F12 → Network tab
   - Look for GraphQL or API requests when the page loads
   - Update `fetch_pools_api()` with the correct endpoint

3. **Adjusting selectors in the code:**
   - Update `pool_selectors` in `fetch_pools_selenium()` 
   - Update extraction patterns in `_extract_pools_from_elements()`
   - Update HTML parsing in `_parse_pools_from_html()`

## Example Adjustments

If you find the page uses specific CSS classes, update this section:

```python
pool_selectors = [
    "//div[contains(@class, 'your-actual-pool-class')]",
    "//tr[contains(@class, 'your-actual-row-class')]",
    # Add your specific selectors here
]
```

## Next Steps

1. **Install dependencies:** `pip install -r requirements.txt`
2. **Install ChromeDriver** (see Installation section above)
3. **Run the inspection script** to understand the page structure
4. **Test the main script** and adjust selectors as needed
5. **Fine-tune the profitability scoring** based on your experience

## Troubleshooting

- **"No pools found"**: The selectors may need adjustment. Run with `--no-headless` to see what's happening
- **"ChromeDriver not found"**: Install ChromeDriver (see Installation)
- **"Selenium not available"**: Run `pip install selenium`
- **Empty results**: Check the page structure and update selectors accordingly

## Notes

- The script waits 10 seconds for React to render - adjust if needed
- Multiple extraction methods are tried as fallbacks
- The profitability score can be adjusted by changing weights in `Pool.profitability_score()`
