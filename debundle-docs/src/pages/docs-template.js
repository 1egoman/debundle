import React from "react";
import styles from './styles.module.css';

import { graphql } from "gatsby"

import Layout from "../components/Layout";
import SEO from "../components/seo";
import Sidebar from "../components/Sidebar";

export const pageQuery = graphql`
  query($path: String!) {
    markdownRemark(frontmatter: { path: { eq: $path } }) {
      html
      frontmatter {
        path
        title
      }
    }
    allMarkdownRemark {
      edges {
        node {
          id
          frontmatter {
            id
            path
            title
            parent
          }
        }
      }
    }
  }
`

function edgesToItems(edges) {
  // [{
  //   name: 'Getting Started',
  //   children: [
  //     {name: 'Foo', to: '/docs/foo'},
  //     {name: 'Bar', to: '/docs/foo'},
  //     {name: 'Baz', children: [
  //       {name: 'Bar', to: '/docs/foo'},
  //     ]},
  //   ],
  // }]

  const itemsById = new Map();
  edges.forEach(edge => {
    itemsById.set(edge.node.frontmatter.id, {
      ...edge.node.frontmatter,
      children: [],
      isAtRoot: true,
    });
  });

  let continueLooping = true;
  while (continueLooping) {
    continueLooping = false;

    for (const [, item] of itemsById) {
      if (item.parent && item.isAtRoot) {
        item.isAtRoot = false;
        itemsById.get(item.parent).children.push(item);
        continueLooping = true;
      }
    }
  }

  return Array.from(itemsById).map(([k, v]) => v).filter(i => i.isAtRoot);
}

const Docs = ({
  data: {
    markdownRemark: {
      frontmatter,
      html,
    },
    allMarkdownRemark: {
      edges,
    },
  }
}) => {
  return (
    <Layout>
      <SEO title={frontmatter.title} />
      <div className={styles.wrapper}>
        <Sidebar
          items={edgesToItems(edges)}
        />
        <main>
          <h1>{frontmatter.title}</h1>
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </main>
      </div>
    </Layout>
  );
}

export default Docs;
