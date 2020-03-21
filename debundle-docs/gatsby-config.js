module.exports = {
  siteMetadata: {
    title: `Debundle: A tool to reverse engineer the web.`,
    description: ``,
    author: `Ryan Gaus <rgaus.net>`,
  },
  plugins: [
    `gatsby-plugin-react-helmet`,
    {
      resolve: `gatsby-source-filesystem`,
      options: {
        name: `images`,
        path: `${__dirname}/src/images`,
      },
    },
    `gatsby-transformer-sharp`,
    `gatsby-plugin-sharp`,
    {
      resolve: `gatsby-plugin-manifest`,
      options: {
        name: `debundle-a-tool-to-reverse-engineer-the-web`,
        short_name: `debundle`,
        start_url: `/`,
        background_color: `#663399`,
        theme_color: `#db5461`,
        display: `minimal-ui`,
        icon: `src/images/gatsby-icon.png`, // This path is relative to the root of the site.
      },
    },
    // this (optional) plugin enables Progressive Web App + Offline functionality
    // To learn more, visit: https://gatsby.dev/offline
    // `gatsby-plugin-offline`,

    // To get dark / light mode switch to work:
    'gatsby-plugin-dark-mode',

    // To load all markdown documentation pages:
    {
      resolve: `gatsby-source-filesystem`,
      options: {
        path: `${__dirname}/src/docs`,
        name: `docs-pages`,
      },
    },
    {
      resolve: `gatsby-transformer-remark`,
      options: {
        plugins: [
          {
            // IMPORTANT: this must be ahead of other plugins that use code blocks
            resolve: 'gatsby-remark-code-titles',
            options: {},
          },
          {
            resolve: `gatsby-remark-prismjs`,
            options: {
              prompt: {
                user: "root",
                host: "localhost",
                global: false,
              },
              aliases: {
                sh: 'bash',
                js: 'javascript',
              },
            },
          },
        ],
      },
    },
  ],
}
