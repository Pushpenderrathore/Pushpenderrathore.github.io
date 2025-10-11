<!-- Beautiful animated GitHub README for Pushpender Singh -->

<div align="center">
  <h1 style="font-size:2.5em; font-weight:700; background:linear-gradient(90deg,#00c6ff,#0072ff); -webkit-background-clip:text; color:transparent;">
    👋 Hi, I'm Pushpender Singh
  </h1>

  <p style="font-size:1.1em; font-weight:500;">
    💻 <strong>B.Tech CSE Student | C & Python Developer | Cybersecurity Learner</strong>
  </p>

  <p>
    <img src="https://komarev.com/ghpvc/?username=Pushpenderrathore&style=flat-square&color=blue" alt="profile views"/>
  </p>
</div>

<br>

<div align="center" style="border-radius:15px; padding:25px; background:linear-gradient(135deg,#0a0f1f,#1e2a47); color:white; box-shadow:0 0 25px rgba(0,0,0,0.3); position:relative; overflow:hidden;">
  <h2 style="margin-bottom:10px;">🚀 About Me</h2>
  <p style="max-width:600px; margin:auto;">
    Passionate about building secure systems, exploring reverse engineering, and creating automation tools.  
    I love Linux, networking, and innovative coding challenges that push my limits.
  </p>

  <div style="margin-top:20px;">
    <img src="https://skillicons.dev/icons?i=c,cpp,python,linux,git,html,css,javascript,mysql&theme=dark" alt="tech stack"/>
  </div>

  <br>

  <div>
    <a href="https://pushpenderrathore.github.io/" target="_blank">
      <img src="https://img.shields.io/badge/🌐%20Portfolio-blue?style=for-the-badge" />
    </a>
    <a href="mailto:pushpenderrathore010@gmail.com">
      <img src="https://img.shields.io/badge/✉️%20Email-me-orange?style=for-the-badge" />
    </a>
    <a href="https://www.linkedin.com/in/pushpenderrathore" target="_blank">
      <img src="https://img.shields.io/badge/LinkedIn-0077B5?logo=linkedin&logoColor=white&style=for-the-badge" />
    </a>
  </div>

  <!-- Animated floating particles -->
  <canvas id="particles" width="500" height="200" style="position:absolute; top:0; left:0; width:100%; height:100%; z-index:0; opacity:0.3;"></canvas>
</div>

<br>

<div align="center">
  <h2>📊 GitHub Stats</h2>
  <img src="https://github-readme-stats.vercel.app/api?username=Pushpenderrathore&show_icons=true&theme=tokyonight" alt="GitHub stats" />
  <br>
  <img src="https://github-readme-streak-stats.herokuapp.com?user=Pushpenderrathore&theme=tokyonight" alt="streak stats" />
</div>

<!-- Small JS animation for particles -->
<script>
const canvas = document.getElementById("particles");
const ctx = canvas.getContext("2d");
let particles = Array.from({length:50}, () => ({
  x: Math.random()*canvas.width,
  y: Math.random()*canvas.height,
  r: Math.random()*2+1,
  dx: Math.random()*0.5-0.25,
  dy: Math.random()*0.5-0.25
}));

function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = "white";
  particles.forEach(p=>{
    ctx.beginPath();
    ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
    ctx.fill();
    p.x+=p.dx; p.y+=p.dy;
    if(p.x<0||p.x>canvas.width) p.dx*=-1;
    if(p.y<0||p.y>canvas.height) p.dy*=-1;
  });
  requestAnimationFrame(draw);
}
draw();
</script>

---

<div align="center">
  <em>“The end is truth — and I code towards it.”</em><br>
  🌌 Made with ❤️ by <strong>Pushpender Singh</strong>
</div>
