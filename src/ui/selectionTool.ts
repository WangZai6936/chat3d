import {create} from 'zustand';
export const useSelectionTool=create<{box:boolean;wholeModel:boolean;through:boolean}>(()=>({box:false,wholeModel:false,through:false}));
