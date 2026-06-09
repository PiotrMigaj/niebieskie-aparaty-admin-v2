import type { File } from "~~/layers/file/shared/types";

export interface Event {
    eventId: string,
    username: string,
    title: string,
    date: string,
    description?: string,
    galleryAvailable: boolean,
    selectionAvailable: boolean,
    imagePlaceholderObjectKey?: string,
    createdAt: Date,
    files?: File[]
}