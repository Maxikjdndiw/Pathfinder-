# Card images

Put real photos for the flying cards here (portrait, about 3:4, e.g. 900 x 1200 px, JPG or WebP, under 200 kB each).

Then open `src/content/cards.ts` and add `image: 'images/<file>'` to the card, for example:

    { title: 'Bocconi', detail: 'Studium in Mailand', kind: 'Uni', variant: 'card', image: 'images/bocconi.jpg' },

Cards without an image keep their generated colour fill.
