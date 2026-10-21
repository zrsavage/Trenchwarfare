# Hosting on GitHub Pages

This repo is a static website. GitHub Pages serves it for free at:

    https://zrsavage.github.io/Trenchwarfare/

## One-time setup (about 1 minute)

1. Open the repo on github.com and go to **Settings**, then **Pages** (left menu).
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Set **Branch** to `claude/trench-warfare-game-design-n4l25i` (this repo's default branch) and the folder to `/ (root)`. Click **Save**.
4. Wait a minute or two, refresh the page, and the live link appears at the top.

Every time new commits are pushed to that branch, the site updates on its own after a minute or two.

## Showing it on a Google Site

On the Google Site page: **Insert**, then **Embed**, then **By URL**, and paste the link above. Also add a link or button to the same address so students can open the game in its own tab, which is much bigger.

## Adding another game later

Put each game in its own folder with an `index.html` inside, for example `napworld/index.html`. It then lives at `https://zrsavage.github.io/Trenchwarfare/napworld/`. This game stays at the root.
