import * as React from 'react';
import { fetchPosts } from '../posts';
import { Route } from "function-declaration.tsx";
const SplitLoader = fetchPosts;
export { SplitLoader as loader };