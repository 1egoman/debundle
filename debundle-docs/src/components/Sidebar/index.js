import React, { Fragment } from "react";
import { Link } from "gatsby";

import styles from './styles.module.css';

const SidebarItem = ({item}) => {
  if (item.children && item.children.length > 0) {
    return (
      <Fragment>
        {item.path ? <Link activeClassName={styles.active} to={item.path}>{item.title}</Link> : <span>{item.name}</span>}
        <div className={styles.item}>
          {item.children.map(i => (
            <SidebarItem key={i.path} item={i} />
          ))}
        </div>
      </Fragment>
    );
  } else {
    return (
      <Link activeClassName={styles.active} to={item.path}>{item.title}</Link>
    );
  }
};

const Sidebar = ({items}) => (
  <div className={styles.sidebar}>
    {items.map(i => (
      <SidebarItem key={i.path} item={i} />
    ))}
  </div>
)

export default Sidebar
