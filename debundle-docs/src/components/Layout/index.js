/**
 * Layout component that queries for data
 * with Gatsby's useStaticQuery component
 *
 * See: https://www.gatsbyjs.org/docs/use-static-query/
 */

import React from "react";

import Header from "../Header";

import styles from './styles.module.css';
import "./colors.css";
import "./fonts.css";
import "./layout.css";

const Layout = ({ children }) => {
  // const data = useStaticQuery(graphql`
  //   query SiteTitleQuery {
  //     site {
  //       siteMetadata {
  //         title
  //       }
  //     }
  //   }
  // `)

  return (
    <div className={styles.wrapper}>
      <Header />
      <div className={styles.content}>
        {children}
      </div>
    </div>
  );
}

export default Layout
