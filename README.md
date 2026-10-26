# Mazo Maps v0.1

A static MapLibre GL JS viewer for Kattankudy points of interest.

## Dataset
Add `data/places.json` with `{"count":144,"results":[...]}` or a plain array. Each record uses only:
`name`, `coordinates`, `address`, `categories`, `phone`, `hours`, `website`, `business_status`.

The map will display a dataset unavailable message until this file is present.

## GitHub Pages
In Settings → Pages choose **GitHub Actions** as the build/deployment source. Pushes to main trigger `.github/workflows/pages.yml`.
Expected URL: https://mazoplatforms.github.io/newmaps/

## Notes
Uses the MapLibre demo basemap for prototyping, not production traffic. Replace it with a production-permitted tile provider or self-hosted tiles. Verify rights to publish POI records before adding the dataset.
