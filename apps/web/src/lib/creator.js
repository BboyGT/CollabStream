export const CREATOR = {
  name: "Godstime Aburu",
  role: "Creator and builder",
  location: "Port Harcourt, Nigeria",
  github: "https://github.com/BboyGT",
  bylines: ["Godstime Aburu"],
  stack: ["React", "Vite", "WebRTC", "Node.js", "Rust", "Tauri"],
  signature: "Built by Godstime Aburu",
  shortSignature: "GTA",
  year: new Date().getFullYear(),
}

export const copyright = () => `Copyright (c) ${CREATOR.year} ${CREATOR.name}`

export const attribution = (projectName) =>
  `${projectName} - designed and built by ${CREATOR.name}`
