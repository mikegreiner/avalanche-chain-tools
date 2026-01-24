#!/usr/bin/env python3
"""
Merge multiple pool tracking history files into a single combined file.

This allows you to combine epoch-specific tracking files into a longer-term
history file for cross-epoch trend analysis.

Usage:
    # Merge specific files
    python3 merge_pool_tracking_files.py output/pool_tracking_2025-11-05_history.json output/pool_tracking_2025-11-12_history.json -o output/pool_tracking_combined_history.json
    
    # Or merge all history files in output directory
    python3 merge_pool_tracking_files.py output/*_history.json -o output/pool_tracking_combined_history.json
"""

import json
import sys
import argparse
from pathlib import Path
from datetime import datetime
from typing import List, Dict


def load_history_file(filepath: str) -> List[Dict]:
    """Load a history file and return list of snapshots."""
    path = Path(filepath)
    if not path.exists():
        print(f"Warning: File not found: {filepath}", file=sys.stderr)
        return []
    
    try:
        with open(path, 'r') as f:
            data = json.load(f)
        
        # Handle both list format and single snapshot format
        if isinstance(data, list):
            return data
        elif isinstance(data, dict) and 'pools' in data:
            # Single snapshot format
            return [data]
        else:
            print(f"Warning: Unexpected format in {filepath}", file=sys.stderr)
            return []
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in {filepath}: {e}", file=sys.stderr)
        return []
    except Exception as e:
        print(f"Error reading {filepath}: {e}", file=sys.stderr)
        return []


def parse_timestamp(ts_str: str) -> datetime:
    """Parse ISO timestamp string to datetime."""
    try:
        if ts_str.endswith('Z'):
            ts_str = ts_str.replace('Z', '+00:00')
        return datetime.fromisoformat(ts_str)
    except Exception:
        # Fallback - return epoch 0 if can't parse
        return datetime.fromtimestamp(0)


def merge_history_files(input_files: List[str], output_file: str, deduplicate: bool = True) -> None:
    """
    Merge multiple history files into one, sorted by timestamp.
    
    Args:
        input_files: List of input history file paths
        output_file: Output file path
        deduplicate: If True, remove duplicate snapshots (same timestamp + same pools)
    """
    all_snapshots = []
    
    print(f"Loading {len(input_files)} history files...")
    for filepath in input_files:
        snapshots = load_history_file(filepath)
        print(f"  {filepath}: {len(snapshots)} snapshots")
        all_snapshots.extend(snapshots)
    
    if not all_snapshots:
        print("Error: No snapshots found in input files", file=sys.stderr)
        sys.exit(1)
    
    print(f"\nTotal snapshots before processing: {len(all_snapshots)}")
    
    # Sort by timestamp
    all_snapshots.sort(key=lambda x: parse_timestamp(x.get('timestamp', '')))
    
    # Deduplicate if requested (same timestamp + same pool count)
    if deduplicate:
        seen = set()
        unique_snapshots = []
        duplicates = 0
        
        for snapshot in all_snapshots:
            # Create a key based on timestamp and pool count
            timestamp = snapshot.get('timestamp', '')
            pool_count = len(snapshot.get('pools', []))
            key = (timestamp, pool_count)
            
            if key not in seen:
                seen.add(key)
                unique_snapshots.append(snapshot)
            else:
                duplicates += 1
        
        print(f"Removed {duplicates} duplicate snapshots")
        all_snapshots = unique_snapshots
    
    # Limit to last 2000 entries (same as tracking script)
    if len(all_snapshots) > 2000:
        print(f"Limiting to last 2000 snapshots (removed {len(all_snapshots) - 2000} oldest)")
        all_snapshots = all_snapshots[-2000:]
    
    # Write merged file
    output_path = Path(output_file)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w') as f:
        json.dump(all_snapshots, f, indent=2)
    
    # Show summary
    if all_snapshots:
        first = all_snapshots[0].get('timestamp', 'unknown')
        last = all_snapshots[-1].get('timestamp', 'unknown')
        print(f"\n[SUCCESS] Merged {len(all_snapshots)} snapshots")
        print(f"  First snapshot: {first}")
        print(f"  Last snapshot: {last}")
        print(f"  Output file: {output_file}")


def main():
    parser = argparse.ArgumentParser(
        description='Merge multiple pool tracking history files into a single combined file',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Merge specific files
  python3 merge_pool_tracking_files.py file1.json file2.json -o combined.json
  
  # Merge all history files in output directory
  python3 merge_pool_tracking_files.py output/*_history.json -o output/combined.json
  
  # Merge without deduplication
  python3 merge_pool_tracking_files.py file1.json file2.json -o combined.json --no-deduplicate
        """
    )
    
    parser.add_argument(
        'input_files',
        nargs='+',
        help='Input history files to merge (can use glob patterns like output/*_history.json)'
    )
    
    parser.add_argument(
        '-o', '--output',
        required=True,
        help='Output file path for merged history'
    )
    
    parser.add_argument(
        '--no-deduplicate',
        action='store_true',
        help='Do not remove duplicate snapshots (same timestamp + pool count)'
    )
    
    args = parser.parse_args()
    
    # Expand glob patterns if needed
    import glob
    expanded_files = []
    for pattern in args.input_files:
        if '*' in pattern or '?' in pattern:
            expanded_files.extend(glob.glob(pattern))
        else:
            expanded_files.append(pattern)
    
    if not expanded_files:
        print("Error: No files found matching input patterns", file=sys.stderr)
        sys.exit(1)
    
    merge_history_files(
        expanded_files,
        args.output,
        deduplicate=not args.no_deduplicate
    )


if __name__ == '__main__':
    main()
