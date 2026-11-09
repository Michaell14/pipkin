// Idle motion for animated kits. Identical to motion.css (a test keeps them in sync); this copy
// exists so `embedMotion: true` can put it inside a self-contained SVG.
//
// Every moving part sits in its own group with its pivot at the local origin, so a transform
// rotates an ear around its base and squashes an eye around its centre:
//   .pipkin-bob      the whole kit (bob up and down)
//   .pipkin-breathe  the whole kit, pivoting at the bottom of the body
//   .pipkin-ear-l/r  each ear, pivoting at its base
//   .pipkin-eye      each eye, pivoting at its centre (blink)
// Per-kit timing comes from CSS variables set on the <svg>, so a crowd never moves in step.
export const MOTION_CSS = `.pipkin .pipkin-bob,.pipkin .pipkin-breathe,.pipkin .pipkin-ear,.pipkin .pipkin-eye{transform-box:view-box;transform-origin:0 0}
.pipkin .pipkin-bob{animation:pipkin-bob var(--pipkin-bob,4.4s) ease-in-out var(--pipkin-delay,0s) infinite}
.pipkin .pipkin-breathe{animation:pipkin-breathe var(--pipkin-breathe,3.8s) ease-in-out var(--pipkin-delay,0s) infinite}
.pipkin .pipkin-eye{animation:pipkin-blink var(--pipkin-blink,5s) linear var(--pipkin-blink-delay,0s) infinite}
.pipkin .pipkin-ear-l{animation:pipkin-twitch-l var(--pipkin-twitch,8s) ease-in-out var(--pipkin-twitch-delay,0s) infinite}
.pipkin .pipkin-ear-r{animation:pipkin-twitch-r var(--pipkin-twitch,8s) ease-in-out var(--pipkin-twitch-delay,0s) infinite}
@keyframes pipkin-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-0.9px)}}
@keyframes pipkin-breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.014,0.982)}}
@keyframes pipkin-blink{0%,93%,100%{transform:scaleY(1)}95.5%{transform:scaleY(0.12)}}
@keyframes pipkin-twitch-l{0%,84%,100%{transform:rotate(0deg)}87%{transform:rotate(-12deg)}90%{transform:rotate(5deg)}93%{transform:rotate(0deg)}}
@keyframes pipkin-twitch-r{0%,86%,100%{transform:rotate(0deg)}89%{transform:rotate(12deg)}92%{transform:rotate(-5deg)}95%{transform:rotate(0deg)}}
.pipkin-hover:not(:hover) *{animation-play-state:paused}
@media (prefers-reduced-motion:reduce){.pipkin *{animation:none!important}}
`;
