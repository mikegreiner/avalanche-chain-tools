// Diagnostic script to understand how pool selection works
// Run this in the browser console while on https://blackhole.xyz/vote
// Then manually click ONE pool and watch what happens

(function() {
    console.log('=== POOL SELECTION DIAGNOSTIC ===');
    console.log('1. This script will monitor the first pool cell');
    console.log('2. Please MANUALLY CLICK one pool on the page');
    console.log('3. Watch the console output to see what changes');
    console.log('================================\n');
    
    const poolCells = document.querySelectorAll('div.liquidity-pool-cell');
    if (poolCells.length === 0) {
        console.error('No pool cells found!');
        return;
    }
    
    const firstCell = poolCells[0];
    console.log('Monitoring first pool cell:', firstCell);
    
    // Store initial state
    const initialState = {
        classes: Array.from(firstCell.classList),
        innerHTML: firstCell.innerHTML.substring(0, 200),
        computedStyle: window.getComputedStyle(firstCell).backgroundColor
    };
    
    console.log('\nInitial state:');
    console.log('  Classes:', initialState.classes);
    console.log('  Background color:', initialState.computedStyle);
    
    // Set up mutation observer to watch for changes
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const newClasses = Array.from(firstCell.classList);
                console.log('\n? CLASS CHANGED!');
                console.log('  Old classes:', initialState.classes);
                console.log('  New classes:', newClasses);
                console.log('  Added:', newClasses.filter(c => !initialState.classes.includes(c)));
                console.log('  Removed:', initialState.classes.filter(c => !newClasses.includes(c)));
            }
            
            if (mutation.type === 'attributes') {
                console.log('\n? ATTRIBUTE CHANGED:', mutation.attributeName);
                console.log('  Old value:', mutation.oldValue);
                console.log('  New value:', firstCell.getAttribute(mutation.attributeName));
            }
        });
    });
    
    observer.observe(firstCell, {
        attributes: true,
        attributeOldValue: true,
        subtree: true,
        childList: true
    });
    
    // Also watch for click events
    firstCell.addEventListener('click', function(e) {
        console.log('\n? CLICK EVENT DETECTED');
        console.log('  Target:', e.target);
        console.log('  Current target:', e.currentTarget);
        console.log('  Event path:', e.composedPath().map(el => el.tagName + (el.className ? '.' + el.className : '')));
    }, true);
    
    // Check React Fiber for event handlers
    const reactKey = Object.keys(firstCell).find(key => key.startsWith('__reactFiber'));
    if (reactKey) {
        console.log('\n? React Fiber found:', reactKey);
        const fiber = firstCell[reactKey];
        
        function walkFiber(fiber, depth) {
            if (!fiber || depth > 5) return;
            if (fiber.memoizedProps) {
                const props = fiber.memoizedProps;
                if (props.onClick || props.onMouseDown || props.onMouseUp) {
                    console.log('  Fiber at depth', depth, 'has event handlers:', {
                        onClick: !!props.onClick,
                        onMouseDown: !!props.onMouseDown,
                        onMouseUp: !!props.onMouseUp,
                        elementType: fiber.elementType ? fiber.elementType.name || fiber.elementType : 'unknown'
                    });
                }
            }
            if (fiber.child) walkFiber(fiber.child, depth + 1);
            if (fiber.sibling) walkFiber(fiber.sibling, depth + 1);
        }
        
        walkFiber(fiber, 0);
    }
    
    console.log('\n=== NOW MANUALLY CLICK A POOL AND WATCH THE OUTPUT ===');
    console.log('After clicking, check for:');
    console.log('  - Class changes (selected, active, etc.)');
    console.log('  - Visual changes (background color, border, etc.)');
    console.log('  - Any console errors');
    
    // Also check what element actually gets clicked
    document.addEventListener('click', function(e) {
        if (e.target.closest('.liquidity-pool-cell')) {
            const cell = e.target.closest('.liquidity-pool-cell');
            console.log('\n? CLICK ON POOL CELL DETECTED');
            console.log('  Clicked element:', e.target.tagName, e.target.className);
            console.log('  Pool cell:', cell);
            console.log('  Cell classes:', Array.from(cell.classList));
        }
    }, true);
})();
