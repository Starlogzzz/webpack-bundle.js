const fs = require("fs");
const path = require("path");
// 拿到⽂件中依赖，这⾥我们不推荐使⽤字符串截取，引⼊的模块名越多，就越麻烦，不灵活，这⾥
// 我们推荐使⽤@babel/parser，这是babel7的⼯具，来帮助我们分析内部的语法，包括es6，返回
// ⼀个ast抽象语法树
const parser = require("@babel/parser");
// 接下来我们就可以根据body⾥⾯的分析结果，遍历出所有的引⼊模块，但是⽐较麻烦，这⾥还是
// 推荐babel推荐的⼀个模块@babel/traverse，来帮我们处理。
const traverse = require("@babel/traverse").default;

const { transformFromAst } = require("@babel/core");

module.exports = class webpack {
  constructor(options) {
    const { entry, output } = options;
    this.entry = entry;
    this.output = output;
    this.modules = [];
  }
  run() {
    //开始分析入口模块的内容
    const info = this.parse(this.entry);

    //递归分析其他的模块
    this.modules.push(info);
    for (let i = 0; i < this.modules.length; i++) {
      const item = this.modules[i];
      // 遍历
      const { dependencies } = item;
      if (dependencies) {
        for (let j in dependencies) {
          // 使用parse处理dependencies
          this.modules.push(this.parse(dependencies[j]));
        }
      }
    }
    const obj = {};
    this.modules.forEach(item => {
      obj[item.entryFile] = {
        dependencies: item.dependencies,
        code: item.code,
      };
    });
    // console.log(obj);
    this.file(obj);
  }
  parse(entryFile) {
    const content = fs.readFileSync(entryFile, "utf-8");
    
    // 分析内部的语法
    const ast = parser.parse(content, {
      sourceType: "module",
    });
    console.log(ast);
    
    // 以对象的形式保存路径
    const dependencies = {};

    // 遍历出所有的引⼊模块
    traverse(ast, {
      // 这是ast的类型名，表示import语句
      ImportDeclaration({ node }) {
        // 保存路径
        //   "./a.js" => "./src/a.js"
        const newPathName =
          "./" + path.join(path.dirname(entryFile), node.source.value);
        // console.log(newPathName);
        
        dependencies[node.source.value] = newPathName;
      },
    });
    const { code } = transformFromAst(ast, null, {
      presets: ["@babel/preset-env"],
    });

    return {
      entryFile,
      dependencies,
      code,
    };
  }
  file(code) {
    //创建自运行函数，处理require,module,exports
    //生成main.js = >dist/main.js
    const filePath = path.join(this.output.path, this.output.filename);
    // console.log(filePath);
    //require("./a.js")
    // this.entry = "./src/index.js"
    const newCode = JSON.stringify(code);
    const bundle = `(function(graph){
        function require(module){
            // 因为代码内部的require的路径为./a.js这种，但对象中的key并不是这种形式
            // 处理code中的require路径，把./a.js处理成./src/a.js
            function reRequire(relativePath){
                return require(graph[module].dependencies[relativePath]) 
            }
            // 定义exports
            var exports = {};
            (function(require,exports,code){
                eval(code)
            })(reRequire,exports,graph[module].code)
            return exports;
        }
        // 传入入口模块
        require('${this.entry}')
    })(${newCode})`;
    // 把bundle和参数code写入文件
    fs.writeFileSync(filePath, bundle, "utf-8");
  }
};
