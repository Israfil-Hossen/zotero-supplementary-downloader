# Zotero Supplementary File Downloader

A Zotero plugin that downloads supplementary/supporting files from publisher websites and attaches them to your Zotero items.

## Features

- **Right-click menu**: Select items → Right-click → "Download Supplementary Files"
- **Batch processing**: Works on multiple selected items at once
- **`[Suppl]` prefix**: Supplementary files are titled `[Suppl] filename.pdf` so you can instantly tell them apart from the main manuscript
- **Red colored tag**: The `supplementary` tag is automatically colored red for visual identification
- **Move to folder**: Optionally copy supplementary files to a folder on your PC, organized by author and year
- **Wide publisher support**: Works with major academic publishers

## Supported Publishers

- Elsevier / ScienceDirect
- Springer / Nature
- Wiley Online Library
- PLOS (ONE, Biology, etc.)
- PNAS
- Taylor & Francis
- MDPI
- ACS Publications
- Oxford Academic (OUP)
- bioRxiv / medRxiv
- Science / AAAS
- Generic fallback for other sites

## Installation

1. Download the latest `.xpi` file from the [Releases](../../releases) page
2. In Zotero: **Tools → Plugins → gear icon → Install Add-on From File**
3. Select the downloaded `.xpi` file

## Usage

### Download Supplementary Files
1. Select one or more items in your Zotero library
2. Right-click → **Download Supplementary Files**
3. The plugin will:
   - Resolve the paper URL from the URL or DOI field
   - Fetch the publisher page
   - Find supplementary file links
   - Download and attach them to each item
   - Title files with `[Suppl]` prefix
   - Tag attachments with red `supplementary` tag

### Set Supplementary Folder (Optional)
1. Go to **Tools → Set Supplementary Files Folder...**
2. Choose a folder on your PC
3. All future supplementary downloads will also be copied there
4. Files are organized into subfolders by `Author Year` (e.g., `Smith 2024/`)

## Requirements

- Zotero 7.x or 8.x
- Items must have a URL or DOI field populated
- Network access to publisher websites (institutional access may be required)

## Building from Source

The XPI is built automatically via GitHub Actions when you push a tag:

```bash
git tag v1.2.0
git push origin v1.2.0
```

Or build manually on Linux/macOS:

```bash
zip -r zotero-supplementary-downloader.xpi manifest.json bootstrap.js supplementary.js LICENSE
```

## License

MIT License - see [LICENSE](LICENSE) for details.
