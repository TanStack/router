// TestComponent.tsx
import React from 'react';

const TestComponent: React.FC = () => {
  return <div>Hello from TestComponent (default export)</div>;
};

export default TestComponent;

export const NamedComponent: React.FC = () => {
  return <div>Hello from NamedComponent (named export)</div>;
};
