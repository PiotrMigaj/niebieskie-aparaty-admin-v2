<template>
  <div class="min-h-screen flex flex-col items-center justify-center bg-white px-4">
    <div class="w-full max-w-md border border-[#e0e0e0] shadow-[0_4px_28px_rgba(0,0,0,0.07)] bg-white px-12 py-12">
      <h1 class="font-cormorant text-5xl font-light tracking-[6px] uppercase text-center text-[#1a2744] leading-tight mb-1">
        Niebieskie<br>Aparaty
      </h1>
      <p class="text-center text-xl tracking-[5px] uppercase text-[#999] mb-8">Admin Panel</p>
      <slot />
    </div>
    <p class="mt-6 text-[11px] text-[#bbb] tracking-wide">© 2025 Niebieskie Aparaty. All Rights Reserved.</p>
  </div>
</template>
