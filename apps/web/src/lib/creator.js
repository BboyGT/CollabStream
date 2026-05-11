export const CREATOR = {
  name: "Godstime Aburu",
  alias: "Golden Masathy",
  role: "Frontend Developer & Technical Writer",
  location: "Port Harcourt, Nigeria",
  github: "https://github.com/BboyGT",
  bylines: ["Godstime Aburu", "Golden Masathy"],
  publications: ["Smashing Magazine", "CSS-Tricks", "SitePoint", "PHP Architect", "Open Replay"],
  stack: ["React", "Vite", "WebRTC", "Node.js", "Rust", "Tauri"],
  signature: "Built by Godstime Aburu",
  shortSignature: "GTA",
  year: new Date().getFullYear(),
}

export const copyright = () => `© ${CREATOR.year} ${CREATOR.name}`

export const attribution = (projectName) =>
  `${projectName} — designed and built by ${CREATOR.name} (${CREATOR.alias})`
