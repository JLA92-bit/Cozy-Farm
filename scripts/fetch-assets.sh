#!/usr/bin/env bash
# Downloads the raw source asset packs into .asset-cache/ (not committed).
# Every pack is CC0 (see CREDITS.md). Run `npm run assets` afterwards to rebuild public/assets.
set -euo pipefail
CACHE="$(cd "$(dirname "$0")/.." && pwd)/.asset-cache"
mkdir -p "$CACHE"
cd "$CACHE"

clone() { # clone <dir> <url> [sparse paths...]
  local dir="$1" url="$2"; shift 2
  if [ -d "$dir/.git" ]; then
    # already cloned: pick up any sparse paths added since (new packs in an existing repo)
    if [ "$#" -gt 0 ]; then git -C "$dir" sparse-checkout set --no-cone "$@" && git -C "$dir" checkout -q; fi
    echo "have $dir"; return
  fi
  if [ "$#" -gt 0 ]; then
    GIT_LFS_SKIP_SMUDGE=1 git clone -q --depth 1 --filter=blob:none --no-checkout "$url" "$dir"
    git -C "$dir" sparse-checkout set --no-cone "$@"
    git -C "$dir" checkout -q
  else
    GIT_LFS_SKIP_SMUDGE=1 git clone -q --depth 1 "$url" "$dir"
  fi
  echo "fetched $dir"
}

# KayKit (Kay Lousberg) - CC0
clone kaykit-hex https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0 '/addons/kaykit_medieval_hexagon_pack/Assets/gltf/' '/addons/kaykit_medieval_hexagon_pack/Textures/' '/addons/kaykit_medieval_hexagon_pack/LICENSE.txt'
clone kaykit-city https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0 '/addons/kaykit_city_builder_bits/Assets/gltf/' '/addons/kaykit_city_builder_bits/Assets/texture/' '/LICENSE.txt'
# KayKit (1.14): Restaurant Bits, Halloween Bits and Furniture Bits - CC0
clone kaykit-restaurant https://github.com/KayKit-Game-Assets/KayKit-Restaurant-Bits-1.0 '/addons/kaykit_restaurant_bits/Assets/gltf/' '/addons/kaykit_restaurant_bits/Assets/textures/' '/LICENSE.txt'
clone kaykit-halloween https://github.com/KayKit-Game-Assets/KayKit-Halloween-Bits-1.0 '/addons/kaykit_halloween_bits/Assets/gltf/' '/addons/kaykit_halloween_bits/Assets/textures/' '/LICENSE.txt'
clone kaykit-furniture https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0 '/addons/kaykit_furniture_bits/Assets/gltf/' '/addons/kaykit_furniture_bits/Assets/texture/' '/LICENSE.txt'
# KayKit Dungeon Remastered (1.31 The Old Mine: timbers, torches, barrels, chests) - CC0
clone kaykit-dungeon https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0 '/addons/kaykit_dungeon_remastered/Assets/gltf/' '/addons/kaykit_dungeon_remastered/Assets/texture/' '/LICENSE.txt'
# Kenney 3D kits as GLB (CC0), mirrored by Hidencod/tge-assets
clone kenney-glb https://github.com/Hidencod/tge-assets '/packs/nature-kit/*.glb' '/packs/cube-pets/*.glb' '/packs/mini-characters/*.glb' '/packs/food-kit/*.glb' '/packs/car-kit/*.glb' '/packs/pirate-kit/*.glb' '/packs/city-kit-suburban/*.glb' '/packs/city-kit-commercial/*.glb' '/packs/castle-kit/*.glb' '/packs/furniture-kit/*.glb' '/LICENSE' '/README.md'
# Kenney audio, particles and Fantasy Town Kit (CC0), mirrored by ETdoFresh/kenney.nl
clone kenney-mirror https://github.com/ETdoFresh/kenney.nl '/kenney_interfacesounds/' '/kenney_rpgaudio/' '/kenney_impactsounds/' '/kenney_musicjingles/' '/kenney_casinoaudio/' '/particlePack_1.1/PNG (Transparent)/' '/fantasy-town-kit-1.0/Models/GLTF format/' '/fantasy-town-kit-1.0/License.txt' '/kenney_holidaypack/Models/GLTF format/' '/minigolf-kit-2.0/Models/GLTF format/' '/kenney_hexagonkit_1/Models/GLTF format/' '/kenney_watercraft_updated/Models/glTF/' '/tower-defense-kit-1/Models/GLTF format/' '/kenney_platformerkit/Models/GLTF format/' '/kenney_graveyardkit_3/Models/GLTF format/'
# FreePD music (CC0), mirrored by SoundSafari/CC0-1.0-Music
clone cc0-music https://github.com/SoundSafari/CC0-1.0-Music '/freepd.com/Barnville.mp3' '/freepd.com/Happy Whistling Ukulele.mp3' '/freepd.com/Magic in the Garden.mp3' '/freepd.com/Spring Chicken.mp3'
# Farm animal sounds (CC0 derivatives of freesound.org recordings) by DJ WoodZ
clone animal-sounds https://github.com/DJWoodZ/Animal-Sounds '/src/sounds/' '/README.md' '/LICENSE'
echo "done -> $CACHE"
