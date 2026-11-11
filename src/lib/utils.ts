import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function installmentAmount(price: number, count = 6) {
  return Math.ceil(price / count);
}

export function showMobileChat(scrollY: number) {
  return scrollY > 400;
}
