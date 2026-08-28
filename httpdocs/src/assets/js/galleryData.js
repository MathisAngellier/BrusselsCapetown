/*
 * Add each new travel update here.
 *
 * Put photos in:
 *   public/img/gallery/
 *
 * Put videos in:
 *   public/video/gallery/
 *
 * Because Vite serves public/ from the site root, the paths below start with /.
 */

export const galleryLocations = [
    {
        id: 1,
        date: "28 August 2026",
        location: "Brussels, Belgium",
        latitude: 50.8503,
        longitude: 4.3517,
        description: "The beginning of the journey. Replace this example with the real story, photos and videos.",
        media: [
            {
                type: "image",
                src: "/img/gallery/example-1.jpg",
                alt: "Example journey photo"
            },
            {
                type: "image",
                src: "/img/gallery/example-2.jpg",
                alt: "Example journey photo"
            },
            {
                type: "video",
                src: "/video/gallery/example-1.mp4",
                poster: "/img/gallery/example-video-poster.jpg",
                alt: "Example journey video"
            }
        ]
    },

    {
        id: 2,
        date: "30 August 2026",
        location: "Paris, France",
        latitude: 48.8566,
        longitude: 2.3522,
        description: "Second example location. Replace this object with the next real location received during the journey.",
        media: [
            {
                type: "image",
                src: "/img/gallery/paris-example-1.jpg",
                alt: "Paris example"
            }
        ]
    }

    // Add the next location by copying the object above.
];
