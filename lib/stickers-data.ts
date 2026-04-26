export const STICKERS = [
  "https://i.postimg.cc/sDwrmPFV/sticker01.png",
  "https://i.postimg.cc/4NBgP6D0/sticker02.png",
  "https://i.postimg.cc/sDVz56NH/sticker03.png",
  "https://i.postimg.cc/hPpBsLk2/sticker04.png",
  "https://i.postimg.cc/m2b47X5y/sticker05.png",
  "https://i.postimg.cc/VLYwXGVK/sticker06.png",
  "https://i.postimg.cc/9FW2y8nF/sticker07.png",
  "https://i.postimg.cc/NG8Y9qpy/sticker08.png",
  "https://i.postimg.cc/jq6Kw0Zs/sticker09.png",
  "https://i.postimg.cc/DfQFJkBn/sticker10.png",
  "https://i.postimg.cc/FFbmd5DQ/sticker11.png",
  "https://i.postimg.cc/gjKPf8nq/sticker12.png",
  "https://i.postimg.cc/BbCGdHXT/sticker13.png",
  "https://i.postimg.cc/2yxfPhVB/sticker14.png",
  "https://i.postimg.cc/x8Q2xtTd/sticker15.png",
  "https://i.postimg.cc/0jvsWc25/sticker16.png",
  "https://i.postimg.cc/D0hTjByy/sticker17.png",
  "https://i.postimg.cc/rmxTNvTg/sticker18.png",
  "https://i.postimg.cc/zvNrt0Xm/sticker19.png",
  "https://i.postimg.cc/WzVvWXbP/sticker20.png",
]

export function getRandomSticker(): string {
  const randomIndex = Math.floor(Math.random() * STICKERS.length)
  return STICKERS[randomIndex]
}
