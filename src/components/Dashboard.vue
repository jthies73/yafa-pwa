<template>
  <section id="center">
    <h1 class="dashboard-headline">Yet Another Fitness App</h1>
  </section>
</template>

<style scoped>
.dashboard-headline {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -1.68px;
  background: linear-gradient(135deg, var(--accent) 0%, #0fd8ca 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: 0 0 30px rgba(31, 199, 185, 0.15);
  margin: 0;
  animation: fade-in-up 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
