<script setup lang="ts">
const { loggedIn, clear } = useUserSession()
const isMenuOpen = ref(false)

const handleLogout = async () => {
  await clear()
  await navigateTo('/login')
}

watch(() => useRoute().fullPath, () => {
  isMenuOpen.value = false
})
</script>

<template>
  <nav class="fixed top-0 w-full bg-white/95 backdrop-blur-sm border-b border-neutral-200 z-40">
    <div class="container mx-auto px-4 lg:px-8">
      <div class="flex justify-between items-center h-18">
        <NuxtLink to="/" class="font-cormorant text-[1.7rem] tracking-[3px] uppercase text-neutral-900">
          Niebieskie Aparaty
        </NuxtLink>

        <div class="hidden lg:flex items-center gap-1">
          <UButton
            to="/"
            variant="ghost"
            color="neutral"
            class="uppercase text-[0.7rem] tracking-[1.5px] font-medium"
          >
            Panel
          </UButton>
          <UButton
            v-if="loggedIn"
            variant="ghost"
            color="neutral"
            class="uppercase text-[0.7rem] tracking-[1.5px] font-medium"
            @click="handleLogout"
          >
            Logout
          </UButton>
        </div>

        <UButton
          variant="ghost"
          color="neutral"
          class="lg:hidden"
          :aria-label="isMenuOpen ? 'Close menu' : 'Open menu'"
          :icon="isMenuOpen ? 'i-lucide-x' : 'i-lucide-menu'"
          @click="isMenuOpen = !isMenuOpen"
        />
      </div>
    </div>

    <div v-if="isMenuOpen" class="lg:hidden bg-white border-t border-neutral-200">
      <ul class="container mx-auto px-4 py-2">
        <li class="border-b border-neutral-100">
          <UButton
            to="/"
            variant="ghost"
            color="neutral"
            class="w-full justify-start uppercase text-[0.7rem] tracking-[1.5px] font-medium"
          >
            Panel
          </UButton>
        </li>
        <li v-if="loggedIn">
          <UButton
            variant="ghost"
            color="neutral"
            class="w-full justify-start uppercase text-[0.7rem] tracking-[1.5px] font-medium"
            @click="handleLogout"
          >
            Logout
          </UButton>
        </li>
      </ul>
    </div>
  </nav>
  <div class="h-18" />
</template>
